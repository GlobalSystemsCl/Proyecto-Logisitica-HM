# Brecha 025 — Email del administrador principal hardcodeado en código y en la base de datos

## Estado
Pendiente

## Severidad
Informational

## Categoría
Architecture / Security hardening

## Descripción
El correo personal del administrador principal aparece literal en 7 lugares del código y en el trigger `handle_new_auth_user`, con lógica especial:
- Si el perfil no existe, se crea con `rol='administrador'` para ese email (`getCurrentUserProfile`, `signIn`).
- El trigger fuerza `rol='administrador'` para ese email al crear o volver a sincronizar.
- No se puede desactivar ni autoregistrar.

Es un "superusuario por email". Si alguien controlara ese correo (compromiso de la cuenta de correo personal), podría recuperar la contraseña y obtener un administrador indesactivable desde la UI.

## Evidencia
- `src/services/auth.service.ts` líneas ~6, ~84, ~188, ~386.
- `src/services/users.service.ts` ~345.
- `src/app/admin/usuarios/UsersTableClient.tsx` ~213, ~544.
- `public.handle_new_auth_user()` (2 comparaciones `LOWER(NEW.email) = '<email>'`).
- `scripts/seed-admin.mjs`.

## Impacto
Bajo hoy. Acopla la seguridad del sistema a una cuenta de correo personal y dificulta el traspaso del sistema a la empresa.

## Cómo reproducirlo
No aplica.

## Causa raíz
Bootstrap del primer administrador resuelto en código.

## Solución propuesta
1. Reemplazar por un flag en BD (`usuario.es_admin_principal boolean`) o una variable de entorno (`ADMIN_PRINCIPAL_EMAIL`) leída en un solo módulo.
2. Quitar la autoasignación de rol administrador en `getCurrentUserProfile` y `signIn` (un perfil faltante debe crearse como ejecutivo no aprobado).
3. Usar un correo corporativo para el administrador principal, con MFA.

## Riesgos de la solución
- Si se elimina la protección sin sustituirla, el admin principal podría desactivarse por error. Mantener la regla con el flag.

## Tests necesarios
- Creación de perfil faltante → nunca administrador.
- El admin principal (por flag) no se puede desactivar.

## Plan de implementación
Constante única → flag en BD → limpieza del trigger.

## Criterios de aceptación
- El email no aparece en el código ni en las funciones SQL.
