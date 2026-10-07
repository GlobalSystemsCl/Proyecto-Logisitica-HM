# Brecha 012 — Bloqueo por intentos fallidos evitable, enumeración de cuentas y sin rate limiting

## Estado
Pendiente

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
