-- Recalcula los contadores de estacionamientos SOLO de las sucursales de simulación.
-- Se ejecuta después de 01-generar-datos.mjs.
select s.id, public.fn_recalcular_slots_sucursal(s.id)
from public.sucursal s
where s.id between 9001 and 9099 and s.nombre like 'STRESS%';

select id, nombre, slots, slots_ocupados, slots_reservados, ultimo_numero_solicitud
from public.sucursal where id between 9001 and 9099 order by id;
