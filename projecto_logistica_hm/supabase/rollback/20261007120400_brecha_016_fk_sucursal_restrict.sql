-- ROLLBACK de 20261007120400_brecha_016_fk_sucursal_restrict.sql
-- Restaura el borrado en cascada (reabre la pérdida de solicitudes, brecha 016).
begin;
alter table public.solicitud drop constraint if exists solicitud_sucursal_fkey;
alter table public.solicitud
  add constraint solicitud_sucursal_fkey
  foreign key (sucursal) references public.sucursal(id)
  on update cascade
  on delete cascade;
commit;
