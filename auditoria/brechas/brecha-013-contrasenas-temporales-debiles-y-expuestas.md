# Brecha 013 — Contraseñas temporales débiles, expuestas al navegador y política de contraseñas inconsistente

## Estado
Corregida

## Severidad
Medium

## Categoría
Security — Weak credentials, Sensitive data exposure

## Descripción
1. `UsersService.generateTempPassword()` genera `HM-` + 7 caracteres con `Math.random()`, que no es criptográficamente seguro. La entropía es de unos 41 bits, con prefijo predecible.
2. `createUserAction` y `resetUserPasswordAction` **devuelven `tempPassword` al navegador** del administrador, aunque el correo se haya enviado bien. Queda en memoria del cliente, en herramientas de desarrollo y, posiblemente, en capturas de pantalla.
3. `createUserAction` acepta una `password` personalizada del admin sin validar su fortaleza.
4. Política débil e inconsistente: `validarPasswordRegistro` exige solo entre 8 y 72 caracteres, sin complejidad. `updatePasswordAction` y `AuthService.updatePassword` exigen solo el mínimo de 8 (no el máximo). La UI de `/establecer-clave` sugiere mayúsculas y números, pero no los exige (`isValid = hasMinLength && passwordsMatch`).
5. Combinado con la brecha 009, la contraseña temporal puede convertirse en permanente.

## Evidencia
- `src/services/users.service.ts` `generateTempPassword` (~10-17), `createUser` (~120, `customPassword`), retorno de `tempPassword` (~199, ~269).
- `src/app/actions/users.actions.ts` (~67, ~126): `tempPassword: result.tempPassword`.
- `src/app/actions/auth.actions.ts` `updatePasswordAction`: solo `length < 8`.
- `src/app/establecer-clave/page.tsx`: `isValid` no usa `hasNumber` ni `hasUppercase`.
- `src/lib/validaciones.ts` `validarPasswordRegistro`.

## Impacto
Contraseñas temporales adivinables con menor esfuerzo, exposición innecesaria de credenciales y usuarios con contraseñas débiles.

## Cómo reproducirlo
Revisión de código. No requiere ejecución.

## Causa raíz
Generador ad hoc y retorno de la contraseña pensado como plan B cuando el correo falla.

## Solución propuesta
1. Usar `crypto.randomBytes`/`crypto.randomInt` con 16+ caracteres.
2. Devolver `tempPassword` solo si `emailSent === false`, mostrarlo una única vez con aviso, o mejor: reemplazar las contraseñas temporales por enlaces de invitación o recuperación de Supabase (`inviteUserByEmail` / `generateLink`).
3. Validar `customPassword` con la misma función de política.
4. Unificar la política de contraseña en `lib/validaciones.ts` y usarla en registro, establecer clave, creación por admin y en la configuración de Supabase Auth.

## Riesgos de la solución
- Cambiar a enlaces de invitación modifica el flujo de alta: coordinar con el uso real de los administradores.

## Tests necesarios
- `generateTempPassword` usa `crypto` y longitud ≥ 16.
- `createUserAction` con email enviado → respuesta sin `tempPassword`.
- `updatePasswordAction` con contraseña débil → error.

## Plan de implementación
1. Generador seguro + validación unificada.
2. Ajustar el retorno de las actions y la UI de `UsersTableClient`.
3. (Opcional) Migrar a invitaciones.

## Criterios de aceptación
- No se devuelven contraseñas al cliente cuando el correo se envió.
- Toda contraseña nueva cumple una única política.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `generateTempPassword`: 16 caracteres con `crypto.randomInt`, siempre con mayúscula, minúscula y número, y mezcla Fisher-Yates. Se eliminaron `Math.random` y el prefijo fijo `HM-`.
- La contraseña temporal **solo vuelve al navegador si el correo falló** (`createUser`, `resetUserPassword`).
- Política única en `src/lib/validaciones.ts` (`validarPassword`, `requisitosPassword`): 10 a 72 caracteres, con mayúscula, minúscula y número. Se aplica en registro, establecer clave (action y service), creación de usuarios por el admin (contraseña personalizada) y en la UI de `/establecer-clave` y `/registro`.

### Archivos
- `src/services/users.service.ts`, `src/lib/validaciones.ts`, `src/app/actions/auth.actions.ts`, `src/services/auth.service.ts`
- `src/app/establecer-clave/page.tsx`, `src/app/registro/RegistroForm.tsx`

### Tests
- `users.service.test.ts`: `should_generate_16_chars_meeting_password_policy`, `should_not_return_temp_password_when_email_was_sent`, `should_return_temp_password_when_email_failed`, `should_reject_weak_custom_password`.
- `validaciones.test.ts`: `validarPassword` y `requisitosPassword`.

### Pendiente (opcional)
- Reemplazar las contraseñas temporales por enlaces de invitación de Supabase (`inviteUserByEmail`).
- Replicar la política en Supabase Auth (ver brecha 012).
