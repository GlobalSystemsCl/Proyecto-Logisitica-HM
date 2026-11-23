-- =============================================================================
-- Sucursal activa / desactivada (2026-11-23)
-- =============================================================================
-- Una sucursal con datos (usuarios, solicitudes, vehículos o traslados) ya no
-- se elimina: se desactiva. Los usuarios dejan de verla en los selectores y
-- listas; el administrador la sigue viendo, marcada como desactivada, y puede
-- reactivarla. Una sucursal sin ningún dato se sigue pudiendo eliminar.
--
--   `sucursal.activa` (boolean, no nulo, por defecto true): todas las
--   sucursales actuales quedan activas.
--
-- Transaccional. Rollback: rollback/20261123120000_sucursal_activa.sql
-- =============================================================================

begin;

alter table public.sucursal add column if not exists activa boolean not null default true;

comment on column public.sucursal.activa is
  'false = desactivada: no aparece a los usuarios; el administrador la ve y puede reactivarla.';

commit;

-- -----------------------------------------------------------------------------
-- Verificación posterior (ejecutar por separado)
-- -----------------------------------------------------------------------------
-- select count(*) filter (where activa) as activas, count(*) as total from public.sucursal;  -- iguales
