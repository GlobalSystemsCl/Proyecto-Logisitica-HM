-- ROLLBACK de 20261009110000_req_estado_traslado_cancelado.sql
-- Postgres no permite eliminar un valor de un enum. Si se revierte la
-- funcionalidad, basta con revertir la migración 20261009120000 (que elimina la
-- función de cancelación): el valor 'cancelado' queda sin uso y no afecta.
-- Para eliminarlo de verdad habría que recrear el tipo (no recomendado).
select 1;
