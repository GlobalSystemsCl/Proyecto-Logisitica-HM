# Brecha 002 — El trigger de registro toma el rol desde metadatos controlados por el usuario

## Estado
Pendiente

## Severidad
Critical

## Categoría
Security / Database — Privilege Escalation, Mass Assignment

## Descripción
La función `public.handle_new_auth_user()` (trigger `on_auth_user_created` en `auth.users`) crea la fila de `public.usuario` con:

```
v_rol := COALESCE(NEW.raw_user_meta_data->>'rol', 'ejecutivo');
```

`raw_user_meta_data` es el objeto `options.data` que **cualquier cliente** envía a `supabase.auth.signUp()`. El registro público está en uso (`AuthService.register` llama a `signUp` con la clave anon), así que cualquier persona puede llamar al endpoint de signup de Supabase directamente con `data: { rol: 'administrador' }` y obtener una cuenta con rol administrador.

## Evidencia
- Función: `public.handle_new_auth_user` (SECURITY DEFINER, sin `search_path` fijo), definición obtenida de `pg_get_functiondef`.
- Trigger: `on_auth_user_created AFTER INSERT ON auth.users`.
- Registro público: `src/services/auth.service.ts` `register()` (~líneas 215-230) usa `supabase.auth.signUp` con cliente anon.
- `UsersService.createUser` (`src/services/users.service.ts` ~línea 140) también envía `rol` en `user_metadata`. Es el uso legítimo que motivó leer el rol desde metadatos.

## Impacto
Cualquier persona en internet puede crear una cuenta de administrador sin intervención de nadie. Combinado con la brecha 003 (la aprobación no funciona), el acceso es inmediato. Si el proyecto exige confirmar el email, el atacante solo necesita un correo propio. La configuración de confirmación de email es **No determinado** desde el código.

## Cómo reproducirlo
(No ejecutado.)
1. `supabase.auth.signUp({ email, password, options: { data: { rol: 'administrador', nombre: 'x', apellido: 'y' } } })` con la clave pública.
2. Confirmar el email si se requiere e iniciar sesión.
3. `public.usuario.rol` = `administrador`.

## Causa raíz
Se confía en `raw_user_meta_data` (dato del cliente) para un atributo de seguridad. Además, `ON CONFLICT ... DO UPDATE SET activo = true` reactiva usuarios.

## Solución propuesta
1. Reescribir `handle_new_auth_user` para **ignorar `rol` de `raw_user_meta_data`**: insertar siempre `'ejecutivo'`, o mejor, un estado no aprobado (ver brecha 003).
2. Para usuarios creados por el admin, `UsersService.createUser` ya hace `upsert` posterior con el rol correcto usando service_role: mantener ese paso como fuente de verdad. Alternativa: leer el rol desde `raw_app_meta_data`, que solo puede escribir service_role (`admin.auth.admin.createUser({ app_metadata: { rol } })`).
3. Quitar `activo = true` del `ON CONFLICT`.
4. Fijar `SET search_path = ''` y calificar los nombres (`public.usuario`).
5. Quitar el email hardcodeado (ver brecha 025).
6. Valorar si el registro público es necesario. Si no, deshabilitar "Allow new users to sign up" en Supabase Auth y crear usuarios solo desde el panel de admin.
7. Revisar la tabla `usuario` buscando cuentas con rol elevado no creadas por el admin.

## Riesgos de la solución
- `createUser` debe seguir asignando el rol correcto. Hay que verificar que el upsert posterior no falle (hoy falla por la columna `aprobado`, ver brecha 003; corregir ambas juntas).
- `EXCEPTION WHEN OTHERS THEN RETURN NEW` oculta errores: un fallo dejaría usuarios Auth sin perfil. Registrar el error con `RAISE LOG`.

## Tests necesarios
- signUp con `data.rol='administrador'` → `usuario.rol = 'ejecutivo'` (o estado pendiente).
- `createUserAction` con rol `logistica` → `usuario.rol = 'logistica'`.
- Usuario re-registrado o duplicado no se reactiva.

## Plan de implementación
1. Migración que reemplace la función (`CREATE OR REPLACE FUNCTION`).
2. Ajustar `UsersService.createUser` para pasar el rol por `app_metadata` (opcional) y verificar el error del upsert.
3. Aplicar en producción con respaldo de la definición actual.
4. Probar signup directo y creación por admin.

## Criterios de aceptación
- Ningún usuario puede obtener un rol distinto de `ejecutivo` (o pendiente) por signup.
- El admin sigue creando usuarios de cualquier rol.
