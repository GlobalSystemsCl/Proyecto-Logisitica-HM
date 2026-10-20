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
    function filaRpc(overrides: Record<string, unknown> = {}) {
      const { sucursal, ...v } = filaVehiculo(overrides);
      return { ...v, ubicacion_nombre: (sucursal as { nombre: string } | null)?.nombre ?? null, total: 25 };
    }

    const SIN_FUNCION = { data: null, error: { message: 'Could not find the function', code: 'PGRST202' } };

    it('should_return_vehiculos_paginated_when_no_filter', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [filaRpc({ id: 'veh-1' }), filaRpc({ id: 'veh-2' })], error: null });
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
      expect(res.vehiculos[0]).not.toHaveProperty('total');
    });

    it('should_call_rpc_with_filters_and_offset_when_searching', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [], error: null });

      await TrasladoService.getVehiculosParaTraslado(' ab%c ', 3, 12, { sucursalId: 3, marca: 'Toyota' });

      expect(admin.rpc).toHaveBeenCalledWith('fn_vehiculos_disponibles_traslado', {
        p_busqueda: 'abc',
        p_sucursal_id: 3,
        p_marca: 'Toyota',
        p_limite: 12,
        p_desplazamiento: 24,
      });
    });

    it('should_send_null_filters_when_none_provided', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [], error: null });

      await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(admin.rpc).toHaveBeenCalledWith('fn_vehiculos_disponibles_traslado', expect.objectContaining({
        p_busqueda: null,
        p_sucursal_id: null,
        p_marca: null,
      }));
    });

    it('should_clamp_page_and_page_size_before_querying', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [], error: null });

      const res = await TrasladoService.getVehiculosParaTraslado('', 0, 500);

      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(100);
      expect(admin.rpc).toHaveBeenCalledWith('fn_vehiculos_disponibles_traslado', expect.objectContaining({
        p_limite: 100,
        p_desplazamiento: 0,
      }));
    });

    it('should_mark_vehicles_in_active_traslado_when_they_are_in_table', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [filaRpc({ id: 'veh-1' }), filaRpc({ id: 'veh-2' })], error: null });
      admin.results.traslado_interno_vehiculo = [fila([nodoTraslado('veh-1')])];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos[0].en_traslado_activo).toBe(true);
      expect(res.vehiculos[1].en_traslado_activo).toBe(false);
    });

    it('should_return_empty_result_when_no_vehiculos_match', async () => {
      admin.rpc.mockResolvedValueOnce({ data: [], error: null });

      const res = await TrasladoService.getVehiculosParaTraslado('sin-resultado', 1, 12);

      expect(res.vehiculos).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.totalPages).toBe(0);
      expect(admin.callsTo('traslado_interno_vehiculo')).toHaveLength(0);
    });

    it('should_return_empty_result_when_rpc_fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XX000' } });

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos).toEqual([]);
      expect(res.total).toBe(0);
      expect(admin.callsTo('vehiculo')).toHaveLength(0);
    });

    it('should_use_previous_query_when_rpc_does_not_exist', async () => {
      admin.rpc.mockResolvedValueOnce(SIN_FUNCION);
      admin.results.vehiculo = [filaConCount(25, [filaVehiculo({ id: 'veh-1' })])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      const res = await TrasladoService.getVehiculosParaTraslado('abc', 1, 12);

      expect(res.total).toBe(25);
      expect(res.vehiculos[0]).toMatchObject({ id: 'veh-1', ubicacion_nombre: 'Sucursal Centro' });
      const orCall = admin.callsTo('vehiculo').find((c) => c[0] === 'or');
      expect(orCall?.[1]).toBe('patente.ilike.%abc%,chasis.ilike.%abc%');
      const order = admin.callsTo('vehiculo').find((c) => c[0] === 'order');
      expect(order?.[1]).toBe('chasis');
    });

    it('should_exclude_reservados_y_vendidos_when_using_previous_query', async () => {
      admin.rpc.mockResolvedValueOnce(SIN_FUNCION);
      admin.results.solicitud_vehiculo = [fila([{ vehiculo_id: 'veh-res' }]), fila([{ vehiculo_id: 'veh-vend' }])];
      admin.results.vehiculo = [filaConCount(1, [filaVehiculo({ id: 'veh-1' })])];
      admin.results.traslado_interno_vehiculo = [fila([])];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12, { sucursalId: 3, marca: 'Toyota' });

      expect(res.vehiculos).toHaveLength(1);
      const notCall = admin.callsTo('vehiculo').find((c) => c[0] === 'not');
      expect(notCall).toEqual(['not', 'id', 'in', '(veh-res,veh-vend)']);
      const eqCalls = admin.callsTo('vehiculo').filter((c) => c[0] === 'eq');
      expect(eqCalls).toEqual(expect.arrayContaining([['eq', 'ubicacion', 3], ['eq', 'marca', 'Toyota']]));
    });

    it('should_return_empty_result_when_previous_query_fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      admin.rpc.mockResolvedValueOnce(SIN_FUNCION);
      admin.results.vehiculo = [{ data: null, error: { message: 'boom' } }];

      const res = await TrasladoService.getVehiculosParaTraslado('', 1, 12);

      expect(res.vehiculos).toEqual([]);
      expect(res.total).toBe(0);
    });
  });

  describe('crearTraslado', () => {
    it('should_crear_traslado_cuando_todos_los_vehiculos_estan_liberados_sin_validar_slots', async () => {
      admin.results.transportista = [fila({ id: 'tr-1', activo: true })];
      admin.results.sucursal = [fila([{ id: 1 }, { id: 2 }])];
      admin.results.usuario = [fila({ id: 'log-1', rol: 'logistica', activo: true })];
      admin.results.traslado_interno_vehiculo = [fila([]), fila(null)];
      admin.results.solicitud_vehiculo = [fila([]), fila([])];
      admin.results.traslado_interno = [fila({ id: 't-1' }), fila(filaTraslado())];
      const auditoria = vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);

      const res = await TrasladoService.crearTraslado(
        { origen_id: 1, destino_id: 2, transportista_id: 'tr-1' },
        ['veh-1'],
        'log-1'
      );

      expect(res.success).toBe(true);
      expect(admin.callsTo('traslado_interno_vehiculo')).toContainEqual([
        'insert',
        [{ traslado_id: 't-1', vehiculo_id: 'veh-1' }],
      ]);
      expect(res.traslado?.id).toBe('t-1');
      const insert = admin.callsTo('traslado_interno').find((c) => c[0] === 'insert');
      expect(insert?.[1]).toMatchObject({ transportista_id: 'tr-1' });
      expect(JSON.stringify(admin.callsTo('sucursal'))).not.toContain('slots');
      expect(admin.callsTo('solicitud_vehiculo').length).toBeGreaterThan(0);
      expect(auditoria).toHaveBeenCalled();
    });

    it('should_rechazar_traslado_cuando_un_vehiculo_esta_vendido', async () => {
      admin.results.transportista = [fila({ id: 'tr-1', activo: true })];
      admin.results.sucursal = [fila([{ id: 1 }, { id: 2 }])];
      admin.results.usuario = [fila({ id: 'log-1', rol: 'logistica', activo: true })];
      admin.results.traslado_interno_vehiculo = [fila([])];
      admin.results.solicitud_vehiculo = [fila([]), fila([{ vehiculo_id: 'veh-2' }])];

      const res = await TrasladoService.crearTraslado(
        { origen_id: 1, destino_id: 2, transportista_id: 'tr-1' },
        ['veh-2'],
        'log-1'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Solo los vehículos disponibles pueden trasladarse.');
      expect(admin.callsTo('traslado_interno').filter((c) => c[0] === 'insert')).toHaveLength(0);
    });

    it('should_rechazar_traslado_cuando_un_vehiculo_esta_reservado_en_solicitud_activa', async () => {
      admin.results.transportista = [fila({ id: 'tr-1', activo: true })];
      admin.results.sucursal = [fila([{ id: 1 }, { id: 2 }])];
      admin.results.usuario = [fila({ id: 'log-1', rol: 'logistica', activo: true })];
      admin.results.traslado_interno_vehiculo = [fila([])];
      admin.results.solicitud_vehiculo = [fila([{ vehiculo_id: 'veh-2' }]), fila([])];

      const res = await TrasladoService.crearTraslado(
        { origen_id: 1, destino_id: 2, transportista_id: 'tr-1' },
        ['veh-2'],
        'log-1'
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Solo los vehículos disponibles pueden trasladarse.');
      expect(admin.callsTo('traslado_interno').filter((c) => c[0] === 'insert')).toHaveLength(0);
    });
  });

  describe('crearTraslado: transportista obligatorio', () => {
    it('should_reject_when_transportista_is_missing', async () => {
      const res = await TrasladoService.crearTraslado({ origen_id: 1, destino_id: 2, transportista_id: null }, ['veh-1'], 'log-1');
      expect(res).toEqual({ success: false, error: 'Indica el transportista del traslado.' });
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });

    it('should_reject_when_transportista_is_inactive_or_unknown', async () => {
      admin.results.transportista = [fila({ id: 'tr-1', activo: false })];
      const res = await TrasladoService.crearTraslado({ origen_id: 1, destino_id: 2, transportista_id: 'tr-1' }, ['veh-1'], 'log-1');
      expect(res).toEqual({ success: false, error: 'El transportista no existe o está inactivo.' });
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });
  });

  describe('crearTraslado: un vehículo por traslado (R14)', () => {
    it('should_reject_when_more_than_one_vehicle_is_selected', async () => {
      const res = await TrasladoService.crearTraslado({ origen_id: 1, destino_id: 2, transportista_id: 'tr-1' }, ['veh-1', 'veh-2'], 'log-1');
      expect(res).toEqual({ success: false, error: 'Cada traslado interno lleva un solo vehículo.' });
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });

    it('should_reject_when_no_vehicle_is_selected', async () => {
      const res = await TrasladoService.crearTraslado({ origen_id: 1, destino_id: 2, transportista_id: 'tr-1' }, [], 'log-1');
      expect(res).toEqual({ success: false, error: 'Debes seleccionar el vehículo del traslado.' });
    });
  });

  describe('cancelarTraslado (R8)', () => {
    it('should_cancel_through_rpc_when_user_is_the_assigned_logistica', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'en_transito' }))];
      const auditoria = vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);

      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'Camión en panne', 1);

      expect(res).toEqual({ success: true });
      expect(admin.rpc).toHaveBeenCalledWith('fn_cancelar_traslado_interno', {
        p_traslado_id: 't-1',
        p_usuario_id: 'log-1',
        p_motivo: 'Camión en panne',
        p_ubicacion: 1,
      });
      expect(auditoria).toHaveBeenCalledWith(
        'log-1',
        'traslado_interno',
        't-1',
        'cancelacion_transito',
        { estado: 'en_transito' },
        { estado: 'cancelado', motivo: 'Camión en panne', ubicacion: 1 }
      );
    });

    it('should_allow_logistica_of_the_zone_and_accept_vehicle_without_location', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'en_transito', logistica_id: 'otro' }))];
      admin.results.usuario_zona = [fila([{ zona_id: 7, zona: { id: 7, nombre: 'Norte' } }])];
      admin.results.sucursal = [fila({ id: 1, nombre: 'N', zona_id: 7 }), fila({ id: 2, nombre: 'S', zona_id: 8 })];
      vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);

      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'Accidente en ruta', null);

      expect(res).toEqual({ success: true });
      expect(admin.rpc).toHaveBeenCalledWith(
        'fn_cancelar_traslado_interno',
        expect.objectContaining({ p_ubicacion: null })
      );
    });

    it('should_reject_logistica_outside_the_zone', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'en_transito', logistica_id: 'otro' }))];
      admin.results.usuario_zona = [fila([{ zona_id: 9, zona: { id: 9, nombre: 'Sur' } }])];
      admin.results.sucursal = [fila({ id: 1, nombre: 'N', zona_id: 7 }), fila({ id: 2, nombre: 'S', zona_id: 8 })];

      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'Accidente en ruta', null);

      expect(res.success).toBe(false);
      expect(admin.rpc).not.toHaveBeenCalled();
    });

    it('should_reject_when_traslado_is_not_in_transit', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'pendiente' }))];
      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'Motivo válido', 1);
      expect(res).toEqual({ success: false, error: 'Solo los traslados en tránsito pueden cancelarse.' });
    });

    it('should_reject_short_reason_without_querying', async () => {
      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'no', 1);
      expect(res.success).toBe(false);
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });

    it('should_return_business_message_when_rpc_fails_with_P0001', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'en_transito' }))];
      admin.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'La sucursal indicada como ubicación no existe.' },
      });

      const res = await TrasladoService.cancelarTraslado('t-1', 'log-1', 'Motivo válido', 99);

      expect(res).toEqual({ success: false, error: 'La sucursal indicada como ubicación no existe.' });
    });
  });

  describe('recibirTraslado con registro (R13)', () => {
    it('should_store_reception_news_and_audit_them', async () => {
      admin.results.traslado_interno = [fila(filaTraslado({ estado: 'en_transito' })), fila(null)];
      admin.results.usuario = [fila({ rol: 'administrador' })];
      const auditoria = vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);

      const res = await TrasladoService.recibirTraslado('t-1', 'adm-1', { conNovedades: true, observacion: ' Rayón ' });

      expect(res).toEqual({ success: true });
      const update = admin.callsTo('traslado_interno').find((c) => c[0] === 'update');
      expect(update?.[1]).toMatchObject({
        estado: 'recepcionado',
        recepcion_con_novedades: true,
        observacion_recepcion: 'Rayón',
      });
      expect(auditoria).toHaveBeenCalledWith(
        'adm-1',
        'traslado_interno',
        't-1',
        'recepcion',
        { estado: 'en_transito' },
        expect.objectContaining({ con_novedades: true, observacion: 'Rayón' })
      );
    });

    it('should_reject_news_without_description', async () => {
      const res = await TrasladoService.recibirTraslado('t-1', 'adm-1', { conNovedades: true });
      expect(res).toEqual({ success: false, error: 'Describe la novedad con la que llegó el vehículo.' });
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });
  });

  describe('getTrasladosEnTransitoHacia (R13)', () => {
    it('should_filter_in_transit_by_destination_branches', async () => {
      admin.results.traslado_interno = [fila([filaTraslado({ estado: 'en_transito' })])];

      const res = await TrasladoService.getTrasladosEnTransitoHacia([2]);

      expect(res).toHaveLength(1);
      expect(admin.callsTo('traslado_interno')).toContainEqual(['eq', 'estado', 'en_transito']);
      expect(admin.callsTo('traslado_interno')).toContainEqual(['in', 'destino_id', [2]]);
    });

    it('should_return_all_in_transit_for_admin', async () => {
      admin.results.traslado_interno = [fila([])];
      await TrasladoService.getTrasladosEnTransitoHacia(null);
      expect(admin.callsTo('traslado_interno').some((c) => c[0] === 'in')).toBe(false);
    });

    it('should_return_empty_without_querying_when_there_are_no_branches', async () => {
      expect(await TrasladoService.getTrasladosEnTransitoHacia([])).toEqual([]);
      expect(admin.callsTo('traslado_interno')).toHaveLength(0);
    });
  });
});