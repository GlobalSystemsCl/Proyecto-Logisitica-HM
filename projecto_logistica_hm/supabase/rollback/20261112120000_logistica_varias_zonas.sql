-- =============================================================================
-- Rollback de 20261112120000_logistica_varias_zonas.sql
-- =============================================================================
-- Vuelve a exigir una zona por usuario. Falla si algún usuario ya tiene más
-- de una: antes hay que dejarle una sola (la consulta de abajo los lista).
-- Desplegar antes el código anterior (src/lib/asignaciones.ts).
-- =============================================================================

-- select usuario_id, count(*) from public.usuario_zona group by usuario_id having count(*) > 1;

begin;

create unique index if not exists usuario_zona_una_por_usuario on public.usuario_zona (usuario_id);

commit;
