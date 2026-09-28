-- =============================================================================
-- Migración: 20260928_rls_nuevas_tablas.sql
-- Fase 1 / Paso 6 — Políticas RLS de traslado_interno e insistencia
-- -----------------------------------------------------------------------------
-- Roles: administrador, jefe_local, logistica, ejecutivo, operaciones
--
-- Helpers ya existentes en el esquema:
--   public.usuario_activo()             -> el usuario existe y está activo
--   public.tiene_rol(VARIADIC text[])   -> el usuario tiene alguno de los roles
--   public.usuario_tiene_sucursal(uuid, bigint) -> sucursal principal o N:M
--
-- NOTA: el servidor usa el cliente admin (service_role) para leer/escribir estas
-- tablas, por lo que estas políticas protegen el acceso directo desde el cliente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- traslado_interno — SELECT
--   admin: todas
--   logistica: solo las suyas
--   jefe_local: las que llegan a una de sus sucursales (destino u origen)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "traslado_select" ON public.traslado_interno;
CREATE POLICY "traslado_select" ON public.traslado_interno
  FOR SELECT TO authenticated
  USING (
    public.usuario_activo() AND (
      public.tiene_rol('administrador')
      OR (public.tiene_rol('logistica') AND logistica_id = auth.uid())
      OR (public.tiene_rol('jefe_local') AND (
            public.usuario_tiene_sucursal(auth.uid(), destino_id)
            OR public.usuario_tiene_sucursal(auth.uid(), origen_id)
          ))
    )
  );

-- -----------------------------------------------------------------------------
-- traslado_interno — mutación (INSERT / UPDATE / DELETE): solo admin y logística
-- El JL destino NO puede rechazar ni modificar: solo recepciona (UPDATE de estado).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "traslado_mutate" ON public.traslado_interno;
CREATE POLICY "traslado_mutate" ON public.traslado_interno
  FOR ALL TO authenticated
  USING (public.usuario_activo() AND (public.tiene_rol('administrador') OR public.tiene_rol('logistica')))
  WITH CHECK (public.usuario_activo() AND (public.tiene_rol('administrador') OR public.tiene_rol('logistica')));

-- -----------------------------------------------------------------------------
-- traslado_interno — UPDATE limitado al JL destino (recepción)
-- USING evalúa la fila VIEJA (debe estar en tránsito) y WITH CHECK la NUEVA
-- (debe quedar recepcionado). Si se exigiera 'recepcionado' en ambos lados la
-- transición en_transito -> recepcionado nunca sería autorizada.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "traslado_recibir_jefe_local" ON public.traslado_interno;
CREATE POLICY "traslado_recibir_jefe_local" ON public.traslado_interno
  FOR UPDATE TO authenticated
  USING (
    public.usuario_activo()
    AND public.tiene_rol('jefe_local')
    AND public.usuario_tiene_sucursal(auth.uid(), destino_id)
    AND estado = 'en_transito'
  )
  WITH CHECK (
    public.usuario_activo()
    AND public.tiene_rol('jefe_local')
    AND public.usuario_tiene_sucursal(auth.uid(), destino_id)
    AND estado = 'recepcionado'
  );

-- -----------------------------------------------------------------------------
-- traslado_interno_vehiculo — SELECT: cualquier usuario activo (se filtra por el traslado)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "traslado_veh_select" ON public.traslado_interno_vehiculo;
CREATE POLICY "traslado_veh_select" ON public.traslado_interno_vehiculo
  FOR SELECT TO authenticated
  USING (
    public.usuario_activo() AND EXISTS (
      SELECT 1 FROM public.traslado_interno t
      WHERE t.id = traslado_id
        AND (
          public.tiene_rol('administrador')
          OR (public.tiene_rol('logistica') AND t.logistica_id = auth.uid())
          OR (public.tiene_rol('jefe_local') AND public.usuario_tiene_sucursal(auth.uid(), t.destino_id))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- traslado_interno_vehiculo — mutación: solo admin y logística
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "traslado_veh_mutate" ON public.traslado_interno_vehiculo;
CREATE POLICY "traslado_veh_mutate" ON public.traslado_interno_vehiculo
  FOR ALL TO authenticated
  USING (public.usuario_activo() AND (public.tiene_rol('administrador') OR public.tiene_rol('logistica')))
  WITH CHECK (public.usuario_activo() AND (public.tiene_rol('administrador') OR public.tiene_rol('logistica')));

-- -----------------------------------------------------------------------------
-- insistencia — SELECT: cualquier usuario activo
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "insistencia_select" ON public.insistencia;
CREATE POLICY "insistencia_select" ON public.insistencia
  FOR SELECT TO authenticated
  USING (public.usuario_activo());

-- -----------------------------------------------------------------------------
-- insistencia — INSERT: solo el propio ejecutivo, sobre sí mismo
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "insistencia_insert" ON public.insistencia;
CREATE POLICY "insistencia_insert" ON public.insistencia
  FOR INSERT TO authenticated
  WITH CHECK (
    public.usuario_activo()
    AND public.tiene_rol('ejecutivo')
    AND usuario_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Verificación (P1.6 / P1.8)
-- -----------------------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public'
--    AND tablename IN ('traslado_interno','traslado_interno_vehiculo','insistencia');
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('traslado_interno','traslado_interno_vehiculo','insistencia')
--  ORDER BY tablename, policyname;
