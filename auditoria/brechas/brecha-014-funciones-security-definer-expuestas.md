# Brecha 014 — Funciones SECURITY DEFINER expuestas y `search_path` mutable

## Estado
Parcial: migración lista, **pendiente de aplicar**; 2 puntos requieren el código actual de las funciones

## Severidad
Medium

## Categoría
Security / Database

## Descripción
1. 12 funciones `SECURITY DEFINER` del schema `public` son ejecutables por `anon` y `authenticated` vía `/rest/v1/rpc/...` (advisors 0028/0029). Las que devuelven `trigger` o `event_trigger` (`handle_new_auth_user`, `rls_auto_enable`, `cambio_estado_auditoria`, `auditoria_disponibilidad`, `notificar_*`, `fn_insistencia_cooldown`) no se pueden invocar útilmente por RPC, pero no deberían estar expuestas. Las invocables son:
   - `usuario_tiene_sucursal(p_usuario_id, p_sucursal_id)`: acepta **cualquier** usuario, así que permite a cualquiera (incluso `anon`) sondear qué sucursales tiene asignadas cada usuario si conoce su UUID.
   - `tiene_rol`, `usuario_activo`, `es_administrador`: solo informan del propio usuario (bajo impacto).
2. `es_administrador()` y `handle_new_auth_user()` son SECURITY DEFINER **sin `search_path` fijo**. Otras 22 funciones tienen `search_path` mutable (advisor 0011). Si un rol pudiera crear objetos en un schema del path, podría secuestrar referencias no calificadas. En Postgres 15+ `public` no concede CREATE por defecto: riesgo bajo, pero es una mala práctica.
3. `es_administrador()` trata `activo` NULL como true (`COALESCE(v_activo, true)`), igual que `tiene_rol` y `usuario_activo`.

## Evidencia
- Advisors de seguridad: `anon_security_definer_function_executable` (12), `authenticated_security_definer_function_executable` (12), `function_search_path_mutable` (22).
- `pg_proc.proconfig` nulo para `es_administrador` y `handle_new_auth_user`.

## Impacto
Exposición menor de información (asignaciones de sucursal) y superficie de ataque innecesaria. Riesgo teórico de secuestro de `search_path`.

## Cómo reproducirlo
(No ejecutado.) `POST /rest/v1/rpc/usuario_tiene_sucursal` con la clave anon y un UUID y una sucursal arbitrarios → `true`/`false`.

## Causa raíz
`GRANT EXECUTE` por defecto a PUBLIC en funciones nuevas; las funciones se crearon sin `SET search_path`.

## Solución propuesta
1. `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated;` para todas las funciones de trigger y `rls_auto_enable`.
2. `usuario_tiene_sucursal`: revocar a `anon`. Para `authenticated`, cambiar la firma a usar `auth.uid()` internamente, o crear una versión interna y otra pública que solo acepte el propio usuario. La app la llama con service_role, así que no se ve afectada.
3. `ALTER FUNCTION ... SET search_path = ''` (o `public, pg_temp`) en las 24 funciones y calificar los objetos.
4. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`.

## Riesgos de la solución
- Revocar `EXECUTE` de funciones usadas dentro de policies (`tiene_rol`, `usuario_activo`, `usuario_tiene_sucursal`) a `authenticated` rompería la RLS: **mantener** EXECUTE para `authenticated` en esas; revocar solo a `anon`.
- `search_path=''` obliga a calificar todos los nombres dentro de la función: probar cada trigger.

## Tests necesarios
- Advisor sin hallazgos 0028/0029 para funciones de trigger.
- RLS sigue funcionando para cada rol (smoke test por rol).
- Cada trigger sigue funcionando: crear, cancelar y finalizar una solicitud de prueba.

## Plan de implementación
1. Migración de `REVOKE` y `ALTER FUNCTION`.
2. Ejecutar advisors.
3. Smoke test del flujo de solicitud.

## Criterios de aceptación
- Advisors de seguridad sin WARN para funciones.
- Flujo completo funcionando.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios (migración)
- Recorre `pg_proc` (las firmas no están versionadas) y para cada función de `public` que no pertenezca a una extensión:
  - revoca EXECUTE a `PUBLIC` y `anon`;
  - en funciones de trigger y event trigger, revoca EXECUTE también a `authenticated`;
  - mantiene EXECUTE para `authenticated` en las demás, porque las policies RLS las usan;
  - fija `search_path = public, pg_temp` donde no esté definido.
- Default privileges: las funciones nuevas no se crean con EXECUTE para PUBLIC ni anon.
- `handle_new_auth_user` (brecha 002) ya usa `search_path = ''`.

### Archivos
- `projecto_logistica_hm/supabase/migrations/20261007120200_brecha_014_funciones_security_definer.sql` (+ rollback)

### Pendiente
1. `usuario_tiene_sucursal`: un usuario autenticado todavía puede consultar las asignaciones de otro. Crear una versión pública basada en `auth.uid()` y otra interna para las policies.
2. `es_administrador`, `tiene_rol` y `usuario_activo`: cambiar `COALESCE(v_activo, true)` a `false`.
3. Después de aplicar: revisar los advisors 0011, 0028 y 0029 y hacer una prueba de humo de cada trigger (crear, cancelar y finalizar una solicitud de prueba).
