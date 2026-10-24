-- =============================================================================
-- Brecha 015 — Alinear el historial de migraciones de Supabase con el repo
-- =============================================================================
-- Las migraciones aplicadas desde el SQL Editor no quedan registradas en
-- supabase_migrations.schema_migrations, y las 2 aplicadas con el conector
-- quedaron con versiones distintas a las de los archivos del repo. Este script
-- registra los archivos de supabase/migrations/ como aplicados, con su
-- versión y nombre exactos, para que `supabase db push` no intente repetirlos.
--
-- Solo toca la tabla de historial (metadatos). No cambia el esquema ni datos.
-- Ejecutar UNA vez, después de aplicar 20261013170000 (brecha 014).
--
-- Equivalente con la CLI (requiere `supabase link` y la contraseña de la BD):
--   supabase migration repair --status reverted 20261013144915 20261013152109
--   supabase migration repair --status applied <versión>   -- por cada archivo
-- =============================================================================

begin;

-- Registros del conector con versiones que no coinciden con los archivos.
delete from supabase_migrations.schema_migrations
where version in ('20261013144915', '20261013152109');

insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261007120000', 'brecha_001_005_permisos_escritura'),
  ('20261007120100', 'brecha_002_003_025_registro_y_aprobacion'),
  ('20261007120200', 'brecha_014_funciones_security_definer'),
  ('20261007120300', 'brecha_010_bloqueo_doble_reserva'),
  ('20261007120400', 'brecha_016_fk_sucursal_restrict'),
  ('20261007120500', 'brecha_024_indices_fk'),
  ('20261007120600', 'brecha_012_intentos_fallidos_atomico'),
  ('20261009110000', 'req_estado_traslado_cancelado'),
  ('20261009120000', 'req_traslados_cancelacion_recepcion'),
  ('20261009130000', 'req_indices_calendario_reportes'),
  ('20261013120000', 'fix_cancelar_traslado_slots_ocupados'),
  ('20261013130000', 'brecha_011_recalculo_slots_unificado'),
  ('20261013140000', 'brecha_011_triggers_recalculo'),
  ('20261013150000', 'brecha_011_trigger_vehiculos'),
  ('20261013155000', 'asignacion_sucursales_y_zonas_por_rol'),
  ('20261013160000', 'brecha_011_recalculo_global'),
  ('20261013170000', 'brecha_014_funciones_rol_y_sucursal'),
  ('20261014120000', 'notificaciones_en_app'),
  ('20261014130000', 'solicitud_creado_por'),
  ('20261020120000', 'fn_vehiculos_disponibles_traslado'),
  ('20261020130000', 'transportista'),
  ('20261020140000', 'notificacion_nuevo_usuario'),
  ('20261024120000', 'codigo_solicitud_por_sucursal')
on conflict (version) do nothing;

commit;

-- -----------------------------------------------------------------------------
-- Verificación (ejecutar por separado): una fila por archivo de migrations/ (23 al 2026-10-24)
-- -----------------------------------------------------------------------------
-- select version, name from supabase_migrations.schema_migrations order by version;
