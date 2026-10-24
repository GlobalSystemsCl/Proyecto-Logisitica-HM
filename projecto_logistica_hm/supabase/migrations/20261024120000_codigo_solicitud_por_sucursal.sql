-- =============================================================================
-- N° de solicitud por sucursal: <código de sucursal>-<correlativo>
-- =============================================================================
-- El n° visible de una solicitud eran los 8 primeros caracteres del uuid
-- (#5EED0001). Pasa a ser el código de la sucursal de ORIGEN más un
-- correlativo propio de esa sucursal: 101-1, 101-2, 102-1... (decisión del
-- responsable, 2026-10-24).
--
-- El código de sucursal ES sucursal.id: los códigos vienen de
-- modelo_excel/Sucursales de Ventas y Marcas.xlsx (hoja "Concecionarios") y
-- son los mismos que trae la columna C.Comp de los Excel de stock, que la
-- importación de vehículos ya resolvía contra sucursal.id. Así
-- solicitud.sucursal ya guarda el código de origen y los services filtran por
-- él, sin columnas ni relaciones nuevas entre solicitud y sucursal.
--
-- Qué hace:
--   1. sucursal.ultimo_numero_solicitud: contador del correlativo.
--   2. solicitud.numero: correlativo dentro de su sucursal de origen, único por
--      (sucursal, numero). El n° visible se arma en la app:
--      src/lib/codigoSolicitud.ts -> `${sucursal}-${numero}`.
--   3. Numera las solicitudes existentes por fecha de creación y deja cada
--      contador en el último número usado.
--   4. Trigger fn_asignar_numero_solicitud: numera al insertar (ignora un
--      numero enviado por el cliente) y no deja editarlo. Si la solicitud cambia
--      de sucursal de origen, toma un número nuevo de la sucursal nueva; si el
--      cambio viene del ON UPDATE CASCADE de sucursal.id, conserva el número.
--      El UPDATE del contador bloquea la fila de la sucursal: dos solicitudes
--      simultáneas de la misma sucursal no reciben el mismo número.
--   5. Carga las 42 sucursales del Excel con id = código (101-145). Quedan sin
--      slots ni zona: el administrador los completa. Las 4 sucursales de prueba
--      existentes (6-9) no cambian; sus solicitudes muestran 6-1, 9-12, etc.
--   6. Mueve la secuencia de sucursal.id sobre el código más alto. La app
--      ahora envía el código al crear una sucursal; la secuencia queda solo
--      como respaldo.
--
-- Aplicar ANTES de desplegar el código: las listas leen solicitud.numero; sin
-- la columna, quedan vacías.
--
-- Rollback: supabase/rollback/20261024120000_codigo_solicitud_por_sucursal.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 y 2. Columnas
-- -----------------------------------------------------------------------------
alter table public.sucursal
  add column if not exists ultimo_numero_solicitud bigint not null default 0;

alter table public.sucursal
  drop constraint if exists sucursal_ultimo_numero_solicitud_check;
alter table public.sucursal
  add constraint sucursal_ultimo_numero_solicitud_check check (ultimo_numero_solicitud >= 0);

alter table public.solicitud
  add column if not exists numero bigint;

alter table public.solicitud
  drop constraint if exists solicitud_sucursal_numero_key;
alter table public.solicitud
  add constraint solicitud_sucursal_numero_key unique (sucursal, numero);

-- -----------------------------------------------------------------------------
-- 3. Numeración de las solicitudes existentes
-- -----------------------------------------------------------------------------
with numeradas as (
  select s.id,
         row_number() over (partition by s.sucursal order by s.fecha_creacion, s.id) as n
  from public.solicitud s
  where s.sucursal is not null
)
update public.solicitud s
set numero = numeradas.n
from numeradas
where numeradas.id = s.id
  and s.numero is distinct from numeradas.n;

update public.sucursal su
set ultimo_numero_solicitud = coalesce(
  (select max(s.numero) from public.solicitud s where s.sucursal = su.id), 0
);

-- -----------------------------------------------------------------------------
-- 4. Trigger de numeración
-- -----------------------------------------------------------------------------
create or replace function public.fn_asignar_numero_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.sucursal is not distinct from old.sucursal then
      new.numero := old.numero;
      return new;
    end if;
    -- ON UPDATE CASCADE de sucursal.id: la sucursal antigua ya no existe y el
    -- contador se fue con la fila renombrada; el número sigue siendo válido.
    if old.sucursal is not null
       and not exists (select 1 from public.sucursal where id = old.sucursal) then
      new.numero := old.numero;
      return new;
    end if;
  end if;

  if new.sucursal is null then
    new.numero := null;
    return new;
  end if;

  update public.sucursal
  set ultimo_numero_solicitud = ultimo_numero_solicitud + 1
  where id = new.sucursal
  returning ultimo_numero_solicitud into new.numero;

  return new;
end;
$$;

revoke execute on function public.fn_asignar_numero_solicitud() from public, anon, authenticated;

drop trigger if exists tr_asignar_numero_solicitud on public.solicitud;
create trigger tr_asignar_numero_solicitud
  before insert or update of sucursal, numero on public.solicitud
  for each row execute function public.fn_asignar_numero_solicitud();

-- -----------------------------------------------------------------------------
-- 5. Sucursales del Excel (id = código)
-- -----------------------------------------------------------------------------
insert into public.sucursal (id, nombre) overriding system value values
  (101, '15 NORTE-VIÑA DEL MAR'),
  (102, '14 NORTE-VIÑA DEL MAR'),
  (103, 'LIBERTAD-VIÑA DEL MAR'),
  (104, 'ORIENTE-VIÑA DEL MAR'),
  (105, 'CHACABUCO-VALPARAISO'),
  (106, 'RODRIGUEZ-VALPARAISO'),
  (107, 'MALL ANTOFAGASTA'),
  (108, 'ARGENTINA-ANTOFAGASTA'),
  (109, 'PEDRO AGUIRRE-ANTOFAGASTA'),
  (110, 'GRANADEROS -CALAMA'),
  (111, 'VICUÑA MACKENA-S.ANTONIO'),
  (112, 'MALL ALAMEDA-SANTIAGO'),
  (113, 'MALL PLAZA OESTE'),
  (114, 'MALL PLAZA OESTE OPEL'),
  (115, 'MALL BELLOTO'),
  (116, 'FREIRE-QUILLOTA'),
  (117, 'CAUPOLICAN-LA CALERA'),
  (118, 'CENTENARIO-LA CALERA'),
  (119, 'LONQUEN-SANTIAGO'),
  (120, 'TORQUEMADA-VIÑA DEL MAR'),
  (121, 'MOVICENTER USADOS'),
  (122, 'MALL PLAZA OESTE MAXUS'),
  (123, 'MALL ANGAMOS ANTOFAGASTA'),
  (124, 'CHACABUCO2-VALPARAISO'),
  (125, 'CARSHOPPING'),
  (126, 'TALCA'),
  (127, 'MALL ANTOFAGASTA OPEL'),
  (128, 'MALL PLAZA OESTE MINI'),
  (129, 'MALL ARAUCO MAIPU HYUNDAI'),
  (130, 'MOVICENTER GEELY'),
  (133, 'MOVICENTER BAIC'),
  (134, 'MALL PLAZA OESTE BAIC'),
  (135, '3 ORIENTE BAIC'),
  (136, '3 ORIENTE JAC'),
  (137, 'MOVICENTER ME'),
  (139, 'LINARES'),
  (140, 'MALL PLAZA TOBALABA'),
  (141, 'USADOS VIRTUAL'),
  (142, 'TALCA 2890'),
  (143, 'MALL PLAZA SUR GAC-MAH'),
  (144, 'MALL PLAZA SUR JAC'),
  (145, 'MALL PLAZA OESTE GAC-ME')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 6. Secuencia de respaldo de sucursal.id
-- -----------------------------------------------------------------------------
select setval(
  pg_get_serial_sequence('public.sucursal', 'id'),
  greatest((select max(id) from public.sucursal), (select last_value from public.sucursal_id_seq))
);

commit;

-- =============================================================================
-- Verificación posterior (solo lectura, ejecutar por separado)
-- =============================================================================
-- select count(*) from public.sucursal where id between 101 and 145;                  -- 42
-- select count(*) filter (where numero is null) as sin_numero, count(*) as total
-- from public.solicitud;                                                              -- sin_numero = 0
-- select su.id, su.nombre, su.ultimo_numero_solicitud, max(s.numero) as maximo
-- from public.sucursal su left join public.solicitud s on s.sucursal = su.id
-- group by su.id having su.ultimo_numero_solicitud <> coalesce(max(s.numero), 0);    -- 0 filas
