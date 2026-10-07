# Brecha 003 — Aprobación de cuentas: la columna `aprobado` no existe en la base de datos

## Estado
Pendiente

## Severidad
High

## Categoría
Bug / Security — Authentication bypass, inconsistencia código-BD

## Descripción
El código implementa un flujo de "registro → pendiente de aprobación → el admin aprueba" usando `usuario.aprobado`, pero **esa columna no existe** en `public.usuario` (`information_schema.columns` no devuelve ninguna columna `aprobado` en todo el esquema). Consecuencias:

1. `AuthService.register` hace `upsert` con `aprobado:false`. PostgREST lo rechaza por columna desconocida y el error **no se verifica**. Tampoco se guarda `sucursal_id` del autoregistrado: la fila la crea el trigger, que no recibe la sucursal.
2. `AuthService.signIn` compara `existingUser.aprobado === false` y `profile.aprobado === false`. El valor siempre es `undefined`, así que nunca bloquea.
3. `UsersService.approveUser` hace `.update({ aprobado: true })` → error previsto ("Could not find the 'aprobado' column"). El botón de aprobar fallaría.
4. `UsersService.createUser` hace `upsert` con `aprobado: true` → error previsto. La action respondería "Usuario creado en Auth pero falló el registro en base de datos". El usuario queda creado (por el trigger) pero sin sucursales a cargo ni zonas, y **no se envía el correo**.
5. La única barrera real es el middleware: `user.user_metadata?.aprobado === false`. `user_metadata` lo puede modificar el propio usuario con `supabase.auth.updateUser({ data: { aprobado: true } })`, así que la barrera es evitable.

> Los puntos 3 y 4 se deducen del código y del esquema; no se ejecutaron. Todos los usuarios actuales (8) tienen `aprobado` = null en los metadatos, lo que sugiere que fueron creados antes de este flujo.

## Evidencia
- Esquema: `public.usuario` no tiene `aprobado` (consulta a `information_schema.columns`, 0 resultados).
- `src/services/auth.service.ts`: líneas ~92, ~226, ~261, ~302, ~396, ~426.
- `src/services/users.service.ts`: líneas ~145, ~167, ~298, ~308.
- `src/lib/supabase/middleware.ts`: línea ~39.
- `src/types/auth.types.ts`: `aprobado?: boolean` en `UserProfile`.
- Tests: `tests/unitarios/auth.service.test.ts` y `users.service.test.ts` usan `aprobado` contra mocks y pasan, por lo que no detectan el problema.

## Impacto
- Cualquier autoregistrado entra al sistema sin aprobación, cambiando sus metadatos o simplemente porque `signIn` no lo bloquea antes de que el middleware actúe.
- La creación de usuarios por el administrador probablemente queda rota (sin correo de credenciales y sin asignaciones).
- Los autoregistrados quedan sin sucursal y no pueden crear solicitudes.

## Cómo reproducirlo
(No ejecutado.)
1. Registrarse en `/registro`.
2. Desde la consola del navegador o un script: `supabase.auth.updateUser({ data: { aprobado: true } })` y luego `signInWithPassword`.
3. Navegar a `/dashboard`: acceso concedido con rol ejecutivo (o admin, con la brecha 002).
4. Como admin, crear un usuario en `/admin/usuarios` → mensaje de error de base de datos.

## Causa raíz
Cambio de código (Dev 2, ~sept-2026) sin la migración correspondiente. El esquema no está versionado (brecha 015), los tests son solo con mocks (brecha 017) y los errores de `upsert` se ignoran.

## Solución propuesta
1. Migración: `ALTER TABLE public.usuario ADD COLUMN aprobado boolean NOT NULL DEFAULT false;` y luego `UPDATE public.usuario SET aprobado = true;` para los 8 usuarios existentes.
2. `handle_new_auth_user`: insertar `aprobado=false` siempre y `sucursal_id` desde metadatos **solo si** se valida que existe. Mejor aún, dejar que `register` lo actualice con service_role.
3. Middleware: dejar de usar `user_metadata.aprobado`. Leer `aprobado` y `activo` desde `public.usuario` (consulta ligera) o desde `app_metadata` (solo escribible por service_role) y sincronizarlo en `approveUser`.
4. `tiene_rol()` y `usuario_activo()`: exigir `aprobado = true`.
5. Verificar el `error` de todos los `upsert` y `update` en `register`, `createUser` y `approveUser`.
6. Actualizar los tipos y los tests (incluir un test que falle si el upsert devuelve error).

## Riesgos de la solución
- Usuarios existentes bloqueados si no se ejecuta el `UPDATE ... SET aprobado=true` en la misma migración.
- Una consulta extra en el middleware afecta la latencia; usar `app_metadata` lo evita.

## Tests necesarios
- Registro → usuario con `aprobado=false` y `sucursal_id` correcto.
- Login de no aprobado → rechazado aunque modifique `user_metadata`.
- `approveUser` → `aprobado=true` y login permitido.
- `createUser` → perfil completo, correo enviado (mock de Brevo), sin error.
- RLS: un usuario no aprobado no lee solicitudes vía REST.

## Plan de implementación
1. Migración de columna + backfill.
2. Ajustar trigger (junto con brecha 002).
3. Ajustar middleware, `signIn`, `register`, `createUser`, `approveUser`.
4. Ajustar las funciones RLS `tiene_rol` y `usuario_activo`.
5. Tests unitarios y prueba manual del flujo completo.

## Criterios de aceptación
- Un autoregistrado no puede usar el sistema hasta que un admin lo apruebe, haga lo que haga con sus metadatos.
- El admin crea usuarios sin errores y el correo se envía.
