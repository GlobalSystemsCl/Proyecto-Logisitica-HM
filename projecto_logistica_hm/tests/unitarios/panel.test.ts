import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gruposPanelEjecutivo, itemsRecepcion, recortar } from '@/lib/panel';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recortar', () => {
  it('should_return_first_items_total_and_remaining', () => {
    expect(recortar([1, 2, 3, 4, 5, 6, 7, 8, 9], 7)).toEqual({ items: [1, 2, 3, 4, 5, 6, 7], total: 9, restantes: 2 });
  });

  it('should_return_all_when_list_is_shorter_than_limit', () => {
    expect(recortar(['a'], 7)).toEqual({ items: ['a'], total: 1, restantes: 0 });
  });

  it('should_handle_missing_list_and_negative_limit', () => {
    expect(recortar(null, 7)).toEqual({ items: [], total: 0, restantes: 0 });
    expect(recortar([1, 2], -1)).toEqual({ items: [], total: 2, restantes: 2 });
  });
});

describe('itemsRecepcion', () => {
  const sol = (id: string, fecha_limite: string | null) =>
    ({
      id,
      sucursal: 1,
      sucursal_nombre: 'Centro',
      sucursal_destino: 2,
      sucursal_destino_nombre: 'Norte',
      titulo_evento: null,
      fecha_limite,
      vehiculos: [{ patente: 'ABCD-12', marca: 'Toyota', modelo: 'Yaris', chasis: 'X', anio: 2024 }],
    }) as unknown as SolicitudLista;
  const tras = (id: string, fecha_despacho: string | null) =>
    ({
      id,
      origen_id: 3,
      origen_nombre: 'Sur',
      destino_id: 2,
      destino_nombre: 'Norte',
      fecha_despacho,
      vehiculos: [{ patente: null, chasis: 'CH1', marca: 'Kia', modelo: 'Rio' }],
    }) as unknown as TrasladoInterno;

  it('should_merge_and_sort_by_nearest_reference_date', () => {
    const res = itemsRecepcion(
      [sol('s1', '2026-10-20T00:00:00Z'), sol('s2', null)],
      [tras('t1', '2026-10-10T00:00:00Z')]
    );
    expect(res.map((r) => r.clave)).toEqual(['t-t1', 's-s1', 's-s2']);
  });

  it('should_describe_route_and_vehicles', () => {
    const [s, t] = itemsRecepcion([sol('s1', '2026-10-01T00:00:00Z')], [tras('t1', '2026-10-02T00:00:00Z')]);
    expect(s).toMatchObject({ tipo: 'solicitud', ruta: 'Centro → Norte', vehiculos: 'ABCD-12 · Toyota Yaris' });
    expect(t).toMatchObject({ tipo: 'traslado', ruta: 'Sur → Norte', vehiculos: 'CH1 · Kia Rio' });
  });

  it('should_return_empty_list_when_nothing_is_in_transit', () => {
    expect(itemsRecepcion([], [])).toEqual([]);
  });
});

describe('gruposPanelEjecutivo', () => {
  const s = (id: string, estado: string, extra: Record<string, unknown> = {}) =>
    ({ id, estado, fecha_creacion: null, fecha_tentativa_despacho: null, fecha_limite: null, fecha_recepcion: null, fecha_entrega: null, ...extra }) as unknown as SolicitudLista;

  it('should_group_by_pending_action', () => {
    const g = gruposPanelEjecutivo([
      s('p', 'pendiente_aprobacion'),
      s('c', 'calendarizada'),
      s('t', 'en_transito'),
      s('e', 'entregada'),
      s('r', 'rechazada'),
      s('x', 'cancelada'),
      s('f', 'finalizada'),
    ]);
    expect(g.pendientes.map((x) => x.id)).toEqual(['p']);
    expect(g.en_curso.map((x) => x.id).sort()).toEqual(['c', 't']);
    expect(g.por_entregar.map((x) => x.id)).toEqual(['e']);
    expect(g.rechazadas.map((x) => x.id)).toEqual(['r']);
  });

  it('should_order_pending_oldest_first_and_closed_newest_first', () => {
    const g = gruposPanelEjecutivo([
      s('p2', 'pendiente_aprobacion', { fecha_creacion: '2026-10-05' }),
      s('p1', 'pendiente_aprobacion', { fecha_creacion: '2026-10-01' }),
      s('r1', 'rechazada', { fecha_creacion: '2026-10-01' }),
      s('r2', 'rechazada', { fecha_creacion: '2026-10-05' }),
    ]);
    expect(g.pendientes.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(g.rechazadas.map((x) => x.id)).toEqual(['r2', 'r1']);
  });

  it('should_order_in_progress_by_nearest_scheduled_or_deadline_date', () => {
    const g = gruposPanelEjecutivo([
      s('a', 'aprobada', { fecha_limite: '2026-10-30' }),
      s('b', 'calendarizada', { fecha_tentativa_despacho: '2026-10-12', fecha_limite: '2026-11-30' }),
      s('c', 'priorizada'),
    ]);
    expect(g.en_curso.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('should_return_empty_groups_when_there_are_no_solicitudes', () => {
    const g = gruposPanelEjecutivo([]);
    expect(Object.values(g).every((l) => l.length === 0)).toBe(true);
  });
});
