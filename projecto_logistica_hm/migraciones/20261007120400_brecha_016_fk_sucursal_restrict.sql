-- =============================================================================
-- Brecha 016 — Eliminar una sucursal borraba en cascada sus solicitudes
-- =============================================================================
-- solicitud.sucursal -> sucursal(id) pasa de ON DELETE CASCADE a RESTRICT.
-- Borrar una sucursal con solicitudes ahora falla en la BD; el service
-- (SucursalesService.deleteSucursal) lo valida antes y devuelve un mensaje
-- claro. ON UPDATE CASCADE se conserva.
--
-- Rollback: supabase/rollback/20261007120400_brecha_016_fk_sucursal_restrict.sql
-- =============================================================================

begin;

alter table public.solicitud
  drop constraint if exists solicitud_sucursal_fkey;

alter table public.solicitud
  add constraint solicitud_sucursal_fkey
  foreign key (sucursal) references public.sucursal(id)
  on update cascade
  on delete restrict;

commit;
