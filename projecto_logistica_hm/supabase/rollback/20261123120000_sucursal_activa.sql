-- Rollback de 20261123120000_sucursal_activa.sql
begin;
alter table public.sucursal drop column if exists activa;
commit;
