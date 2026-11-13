-- =============================================================================
-- Rollback de 20261113110000_traslado_numero_documentos.sql
-- =============================================================================
-- Antes, desplegar una versión de la app que no lea `traslado_interno.numero`
-- ni `traslado_documento`. Los archivos ya subidos a Storage
-- (`solicitud-documentos/traslados/...`) no se borran: hacerlo a mano si se
-- quieren eliminar.
-- =============================================================================

begin;

drop table if exists public.traslado_documento;
drop index if exists public.traslado_interno_numero_key;
alter table public.traslado_interno drop column if exists numero;
drop sequence if exists public.traslado_interno_numero_seq;

commit;
