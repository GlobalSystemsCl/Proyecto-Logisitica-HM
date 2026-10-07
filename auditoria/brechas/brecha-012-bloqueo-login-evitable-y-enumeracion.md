# Brecha 012 — Bloqueo por intentos fallidos evitable, enumeración de cuentas y sin rate limiting

## Estado
Parcial: código corregido; **falta configuración en el dashboard de Supabase**

## Severidad
Medium

## Categoría
Security — Brute force, User enumeration, Rate limiting

## Descripción
1. El bloqueo de 5 intentos / 15 minutos está solo en `AuthService.signIn` (Server Action). El endpoint de Supabase Auth (`/auth/v1/token?grant_type=password`) es público con la clave anon y no consulta `usuario.bloqueado_hasta`. Un atacante lo usa directamente y evita el bloqueo. Solo quedan los límites genéricos de Supabase (No determinado su valor configurado).
2. El incremento de `intentos_fallidos` es lectura-modificación-escritura no atómica: intentos en paralelo cuentan menos.
3. Los mensajes permiten enumerar cuentas y su estado: "Credenciales inválidas. Te quedan N intento(s)" (la cuenta existe) frente a "Verifica tu correo y contraseña" (no existe); "cuenta desactivada"; "bloqueada"; en recuperación, "no se puede restablecer… cuenta desactivada".
4. Un tercero puede bloquear cuentas ajenas (DoS dirigido) enviando 5 contraseñas erróneas por la action.
5. Sin rate limiting en `registerAction`, `requestPasswordResetAction` (envío masivo de correos) ni en las demás actions.
6. La protección de contraseñas filtradas (HaveIBeenPwned) está **desactivada** (advisor `auth_leaked_password_protection`).

## Evidencia
- `src/services/auth.service.ts` `signIn` (~276-440), incremento ~340-350, mensajes ~295-370; `sendPasswordResetEmail` (~455-490).
- Advisor de seguridad de Supabase: "Leaked Password Protection Disabled".
- No se encontró middleware ni librería de rate limiting en el código analizado.

## Impacto
Ataques de fuerza bruta o credential stuffing contra cuentas, incluida la del administrador principal, cuya contraseña inicial es débil (brecha 007). Descubrimiento de qué correos son empleados. Bloqueo malicioso de usuarios.

## Cómo reproducirlo
(No ejecutado.) Repetir `supabase.auth.signInWithPassword` directo contra Auth: no hay bloqueo de la app.

## Causa raíz
Control de seguridad implementado en la capa de aplicación para un recurso (Auth) que también es accesible directamente.

## Solución propuesta
1. Activar en Supabase Auth: leaked password protection, política de contraseñas fuerte (longitud ≥ 10-12, complejidad) y CAPTCHA (hCaptcha o Turnstile) en signup, signin y recover.
2. Revisar y ajustar los rate limits de Auth en el dashboard.
3. Mensajes genéricos: "Credenciales inválidas o cuenta no habilitada" en login; "Si el correo existe, te enviaremos un enlace" en recuperación.
4. Contador atómico: RPC `fn_registrar_intento_fallido(email)` con `UPDATE … SET intentos_fallidos = intentos_fallidos + 1 … RETURNING`.
5. Rate limiting por IP en las actions públicas (registro, login, reset), por ejemplo con Upstash Ratelimit o un middleware con almacenamiento.
6. MFA (TOTP) para administradores.

## Riesgos de la solución
- CAPTCHA y mensajes genéricos afectan la UX; comunicarlo a los usuarios.
- Rate limiting por IP en redes corporativas con NAT compartido puede bloquear a varios usuarios: usar umbrales razonables.

## Tests necesarios
- 5 fallos concurrentes → contador = 5.
- Mensajes iguales para cuenta existente y no existente.
- Reset con email inexistente → mismo mensaje de éxito.

## Plan de implementación
1. Configuración en el dashboard de Supabase (sin código).
2. Mensajes y RPC atómica.
3. Rate limiting.

## Criterios de aceptación
- La fuerza bruta directa contra Auth está limitada por CAPTCHA y rate limits.
- No es posible distinguir cuentas existentes por los mensajes.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- **Sin enumeración de cuentas:** el login responde siempre con el mismo mensaje para correo inexistente, contraseña errónea y cuenta bloqueada. El estado "desactivada" o "pendiente" solo se revela a quien ya validó la contraseña. La recuperación responde igual exista o no la cuenta, y una cuenta inactiva no recibe correo.
- **Bloqueo sin probar la contraseña:** mientras dure el bloqueo, no se llama a Supabase Auth.
- **Contador atómico:** RPC `fn_registrar_intento_fallido` (incremento y bloqueo en una sentencia, solo ejecutable por service_role). Si la RPC aún no existe, se usa la actualización anterior como respaldo.

### Archivos
- `src/services/auth.service.ts` (`MENSAJE_LOGIN_FALLIDO`, `registrarIntentoFallido`), `src/app/actions/auth.actions.ts`
- `projecto_logistica_hm/supabase/migrations/20261007120600_brecha_012_intentos_fallidos_atomico.sql` (+ rollback)

### Tests
- `auth.service.test.ts`: `should_return_same_message_when_user_does_not_exist_or_password_is_wrong`, `should_not_try_password_and_return_generic_message_when_account_is_locked`, `should_increment_attempts_atomically_through_rpc_on_failure`, `should_report_success_without_sending_when_account_does_not_exist`.

### Pendiente (responsable, en el dashboard de Supabase)
1. Authentication → Attack Protection: activar **Leaked password protection** (el advisor la reporta desactivada).
2. Authentication → Policies: política de contraseñas igual a la de la app (mínimo 10, mayúscula, minúscula y número).
3. CAPTCHA (Turnstile o hCaptcha) en signup, signin y recover. Requiere además integrar el widget en los formularios.
4. Revisar los rate limits de Auth.
5. MFA (TOTP) para administradores.

### Pendiente (código)
- Rate limiting por IP en las actions públicas (requiere almacenamiento compartido, por ejemplo Upstash Ratelimit).
- El bloqueo de 5 intentos sigue permitiendo que un tercero bloquee cuentas ajenas durante 15 minutos. Es inherente al bloqueo por cuenta; el CAPTCHA lo mitiga.
