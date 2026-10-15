-- ROLLBACK de 20261009120000_req_traslados_cancelacion_recepcion.sql
-- Las columnas nuevas se conservan (pueden tener datos de cancelaciones y
-- recepciones ya registradas). Descomentar para eliminarlas.
begin;
drop function if exists public.fn_cancelar_solicitud_en_transito(uuid, uuid, text, bigint);
drop function if exists public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint);
drop trigger if exists tr_validar_un_vehiculo_por_traslado on public.traslado_interno_vehiculo;
drop function if exists public.fn_validar_un_vehiculo_por_traslado();
-- alter table public.traslado_interno
--   drop column if exists motivo_cancelacion,
--   drop column if exists fecha_cancelacion,
--   drop column if exists cancelado_por,
--   drop column if exists recepcion_con_novedades,
--   drop column if exists observacion_recepcion;
commit;
