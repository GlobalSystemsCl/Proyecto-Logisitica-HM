import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila, filaConCount } from '../mocks/supabase';
import { SolicitudesService } from '@/services/solicitudes.service';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const { TrasladoService } = await import('@/services/traslado.service');

function filaVehiculo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh-1',
    chasis: '1HGCM82633A004352',
    patente: 'ABCD-12',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2024,
    color: 'Negro',
    ubicacion: 1,
    sucursal: { nombre: 'Sucursal Centro' },
    ...overrides,
  };
}

function nodoTraslado(vehiculoId: string) {
  return { vehiculo_id: vehiculoId };
}

function filaTraslado(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    origen_id: 1,
    destino_id: 2,
    logistica_id: 'log-1',
    estado: 'pendiente',
    fecha_despacho: null,
    fecha_recepcion: null,
    observacion: null,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    origen: { nombre: 'Sucursal Norte' },
    destino: { nombre: 'Sucursal Sur' },
    logistica: { nombre: 'Ana', apellido: 'Pérez' },
    traslado_interno_vehiculo: [
      {
        id: 'tv-1',
        disponibilidad: 'reservado',
        vehiculo_id: 'veh-1',
        vehiculo: {
          id: 'veh-1',
          chasis: '1HGCM82633A004352',
          patente: 'ABCD-12',
          marca: 'Toyota',
          modelo: 'Corolla',
          anio: 2024,
          color: 'Negro',
          ubicacion: 1,
        },
      },
    ],
    ...overrides,
  };
}

describe('TrasladoService', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getVehiculosParaTraslado', () => {
    it('should_return_vehiculos_paginated_when_no_filter', async () => {
      admin.results.vehiculo = [
        filaConCount(25, [filaVehiculo({ id: 'veh-1' }), filaVehiculo({ id: 'veh-2' })]),
      ];
      admin.results.traslado_interno_vehiculo = [fila([])];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos).toHaveLength(2);
      expect(res.total).toBe(25);
      expect(res.page).toBe(1);
      expect(res.totalPages).toBe(3);
      expect(res.vehiculos[0]).toMatchObject({
        id: 'veh-1',
        patente: 'ABCD-12',
        ubicacion_nombre: 'Sucursal Centro',
        en_traslado_activo: false,
      });
    });

    it('should_clamp_page_and_page_size_before_querying', async () => {
      admin.results.vehiculo = [filaConCount(0, [])];

      const res = await TrasladoService.getVehiculosParaTraslado('', 0, 500);

      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(100);
      const range = admin.callsTo('vehiculo').find((c) => c[0] === 'range');
      expect(range?.[1]).toBe(0);
      expect(range?.[2]).toBe(99);
    });

    it('should_filter_by_patente_or_chasis_when_query_provided', async () => {
      admin.results.vehiculo = [filaConCount(1, [filaVehiculo()])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      await TrasladoService.getVehiculosParaTraslado('abc', 1, 12);

      const orCall = admin.callsTo('vehiculo').find((c) => c[0] === 'or');
      expect(orCall?.[1]).toBe('patente.ilike.%abc%,chasis.ilike.%abc%');
    });

    it('should_sanitize_percent_wildcards_from_query', async () => {
      admin.results.vehiculo = [filaConCount(1, [filaVehiculo()])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      await TrasladoService.getVehiculosParaTraslado('a%bc', 1, 12);

      const orCall = admin.callsTo('vehiculo').find((c) => c[0] === 'or');
      expect(orCall?.[1]).toBe('patente.ilike.%abc%,chasis.ilike.%abc%');
    });

    it('should_mark_vehicles_in_active_traslado_when_they_are_in_table', async () => {
      admin.results.vehiculo = [
        filaConCount(2, [filaVehiculo({ id: 'veh-1' }), filaVehiculo({ id: 'veh-2' })]),
      ];
      admin.results.traslado_interno_vehiculo = [fila([nodoTraslado('veh-1')])];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos[0].en_traslado_activo).toBe(true);
      expect(res.vehiculos[1].en_traslado_activo).toBe(false);
    });

    it('should_return_empty_result_when_no_vehiculos_match', async () => {
      admin.results.vehiculo = [filaConCount(0, [])];

      const res = await TrasladoService.getVehiculosParaTraslado('sin-resultado', 1, 12);

      expect(res.vehiculos).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
      expect(admin.callsTo('traslado_interno_vehiculo')).toHaveLength(0);
    });

    it('should_filter_by_sucursal_when_sucursal_filter_provided', async () => {
      admin.results.vehiculo = [filaConCount(1, [filaVehiculo()])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      await TrasladoService.getVehiculosParaTraslado('', 1, 12, { sucursalId: 3 });

      const eqCalls = admin.callsTo('vehiculo').filter((c) => c[0] === 'eq');
      expect(eqCalls.some((c) => c[1] === 'ubicacion' && c[2] === 3)).toBe(true);
    });

    it('should_filter_by_marca_when_marca_filter_provided', async () => {
      admin.results.vehiculo = [filaConCount(1, [filaVehiculo()])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      await TrasladoService.getVehiculosParaTraslado('', 1, 12, { marca: 'Toyota' });

      const eqCalls = admin.callsTo('vehiculo').filter((c) => c[0] === 'eq');
      expect(eqCalls.some((c) => c[1] === 'marca' && c[2] === 'Toyota')).toBe(true);
    });

    it('should_return_empty_result_when_vehiculo_query_fails', async () => {
      admin.results.vehiculo = [{ data: null, error: { message: 'boom' } }];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos).toEqual([]);
      expect(res.total).toBe(0);
    });
  });

  describe('crearTraslado', () => {
    it('should_crear_traslado_de_cualquier_vehiculo_sin_validar_estado_ni_slots', async () => {
      admin.results.sucursal = [fila([{ id: 1 }, { id: 2 }])];
      admin.results.usuario = [fila({ id: 'log-1', rol: 'logistica', activo: true })];
      admin.results.traslado_interno_vehiculo = [fila([]), fila(null)];
      admin.results.traslado_interno = [fila({ id: 't-1' }), fila(filaTraslado())];
      const auditoria = vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);

      const res = await TrasladoService.crearTraslado(
        { origen_id: 1, destino_id: 2 },
        ['veh-1', 'veh-2', 'veh-3'],
        'log-1'
      );

      expect(res.success).toBe(true);
      expect(res.traslado?.id).toBe('t-1');
      expect(JSON.stringify(admin.callsTo('sucursal'))).not.toContain('slots');
      expect(admin.callsTo('solicitud_vehiculo')).toHaveLength(0);
      expect(auditoria).toHaveBeenCalled();
    });
  });
});