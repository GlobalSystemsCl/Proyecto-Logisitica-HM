-- ============================================================================
-- 20261004 — RLS: el Jefe de Local puede INSERTAR solicitudes (y delegarlas)
-- ============================================================================
-- CONTEXTO
--   La politica vigente `solicitud_insert_ejecutivo` solo admitia a
--   `administrador` y `ejecutivo`, y exigia `ejecutivo_id = auth.uid()`. Un
--   `jefe_local` que creara una solicitud desde el cliente (anon key) seria
--   rechazado por RLS, aunque la aplicacion si lo permite.
--
--   Hoy esto es inerte: todo el backend usa `createAdminClient()` (service_role,
--   `src/lib/supabase/admin.ts`), que bypasea RLS por completo. El control real
--   esta en la capa de aplicacion (`createSolicitudAction` en
--   `src/app/actions/solicitudes.actions.ts`), que si valida rol, alcance de
--   sucursal y delegabilidad. Esta migracion alinea la politica con esa logica
--   para que no sea una trampa si algun dia el acceso pasa por el cliente.
--
-- REGLAS DE NEGOCIO REFLEJADAS (identicas a las del action)
--   1. Solo usuarios activos.
--   2. `administrador`  -> sin restricciones.
--   3. `ejecutivo`      -> `ejecutivo_id = auth.uid()` (siempre a nombre
--                           propio) y `sucursal` = su sucursal principal.
--   4. `jefe_local`     -> `sucursal` debe ser una sucursal que administra
--                           (`usuario_tiene_sucursal`: principal + encargado), y
--                           `ejecutivo_id` debe ser NULL (se queda a su cargo) o
--                           un ejecutivo ACTIVO de ESA MISMA sucursal.
--
-- NOTA
--   `public.usuario_tiene_sucursal` es SECURITY DEFINER (20260928), necesaria
--   para que la politica pueda leer `public.sucursal` sin quedar filtrada por la
--   RLS de esa tabla (que solo deja ver filas al administrador).
-- ============================================================================

DROP POLICY IF EXISTS "solicitud_insert_ejecutivo" ON public.solicitud;

CREATE POLICY "solicitud_insert_gestores" ON public.solicitud
FOR INSERT TO authenticated
WITH CHECK (
    usuario_activo()
    AND (
        tiene_rol(VARIADIC ARRAY['administrador'::text])
        OR (
            tiene_rol(VARIADIC ARRAY['ejecutivo'::text])
            AND ejecutivo_id = auth.uid()
            AND sucursal = (SELECT u.sucursal_id FROM public.usuario u WHERE u.id = auth.uid())
        )
        OR (
            tiene_rol(VARIADIC ARRAY['jefe_local'::text])
            AND public.usuario_tiene_sucursal(auth.uid(), solicitud.sucursal)
            AND (
                ejecutivo_id IS NULL
                OR EXISTS (
                    SELECT 1
                    FROM public.usuario e
                    WHERE e.id = solicitud.ejecutivo_id
                      AND e.rol = 'ejecutivo'
                      AND e.activo
                      AND e.sucursal_id = solicitud.sucursal
                )
            )
        )
    )
);

-- VERIFICACION (esperado: 0 filas fuera de las tres reglas)
-- SELECT id, sucursal, ejecutivo_id, jefe_local_id FROM public.solicitud s
-- WHERE creado_por <> auth.uid();
--
-- La politica debe permitir los 3 perfiles:
--   - admin:     INSERT con cualquier sucursal y sin ejecutivo.
--   - ejecutivo: INSERT con ejecutivo_id = <propio id> y su sucursal.
--   - jefe:      INSERT desde una sucursal que administra, con ejecutivo_id NULL
--                o con un ejecutivo activo de esa sucursal.