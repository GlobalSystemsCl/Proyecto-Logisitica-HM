-- zona.id es GENERATED ALWAYS: insertarla por la API gastaría un número de la secuencia
-- real. OVERRIDING SYSTEM VALUE fija el id 9001 sin tocar la secuencia. Idempotente.
insert into public.zona (id, nombre)
overriding system value
values (9001, 'STRESS - Prueba de carga')
on conflict (id) do nothing;

select id, nombre from public.zona order by id;
