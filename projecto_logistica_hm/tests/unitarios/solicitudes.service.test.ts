import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseMock, fila, filaConCount, type MockResult, type SupabaseMock } from '../mocks/supabase';
import {
  SolicitudesService,
  ESTADOS_ACTIVOS_RESERVA,
  getEncargadoId,
  getEncargadoNombre,
  type SolicitudMinima,
} from '@/services/solicitudes.service';
import type { SolicitudLista } from '@/types/solicitud.types';

const admin: SupabaseMock = createSupabaseMock();
/** El mock cumple el contrato mínimo que el servicio espera de un `SupabaseClient`. */
const adminClient = admin as unknown as SupabaseClient;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const USUARIO_ID = 'u-1';
const BUCKET = 'solicitud-documentos';

function errorResult(message: string): MockResult {
  return { data: null, error: { message } };
}

function minimo(overrides: Partial<SolicitudMinima> = {}): SolicitudMinima {
  return {
    id: 's-1',
    estado: 'pendiente',
    sucursal: 1,
    sucursal_destino: 2,
    ejecutivo_id: null,
    jefe_local_id: null,
    logistica_id: null,
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_inicio_transito: null,
    ...overrides,
  };
}

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    sucursal: 1,
    sucursal_destino: 2,
    estado: 'pendiente',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    jefe_local_id: null,
    logistica_id: null,
    fecha_creacion: '2026-01-01T10:00:00Z',
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    suc: { nombre: 'Sucursal Norte' },
    destino: { nombre: 'Sucursal Sur' },
    ejecutivo: null,
    jefe: null,
    logistica: null,
    solicitud_vehiculo: [
      {
        id: 'sv-1',
        disponibilidad: 'reservado',
        vehiculo: {
          chasis: 'WBA3A5C50FF123456',
          patente: 'ABC123',
          marca: 'Toyota',
          modelo: 'Corolla',
          anio: 2020,
          color: 'Rojo',
        },
      },
    ],
    ...overrides,
  };
}

function spyRegistrarAuditoria() {
  return vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);
}

function archivo(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'documento.pdf',
    tipo: 'application/pdf',
    tamano: 1024,
    buffer: new ArrayBuffer(8),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ESTADOS_ACTIVOS_RESERVA', () => {
  it('should_incluir_todos_los_estados_con_vehiculo_reservado', () => {
    expect([...ESTADOS_ACTIVOS_RESERVA]).toEqual([
      'pendiente_aprobacion',
      'aprobada',
      'pendiente',
      'priorizada',
      'asignada',
      'calendarizada',
      'en_transito',
    ]);
  });
});

describe('getEncargadoNombre/getEncargadoId', () => {
  it('should_devolver_nombre_del_ejecutivo_cuando_existe', () => {
    const sol = { ejecutivo_id: 'e-1', ejecutivo_nombre: 'Ana', jefe_local_id: 'j-1', jefe_local_nombre: 'Luis' } as SolicitudLista;
    expect(getEncargadoNombre(sol)).toBe('Ana');
    expect(getEncargadoId(sol)).toBe('e-1');
  });

  it('should_devolver_nombre_del_jefe_local_sin_ejecutivo', () => {
    const sol = { ejecutivo_id: null, ejecutivo_nombre: null, jefe_local_id: 'j-1', jefe_local_nombre: 'Luis' } as SolicitudLista;
    expect(getEncargadoNombre(sol)).toBe('Luis');
    expect(getEncargadoId(sol)).toBe('j-1');
  });

  it('should_devolver_null_sin_encargado', () => {
    const sol = { ejecutivo_id: null, ejecutivo_nombre: null, jefe_local_id: null, jefe_local_nombre: null } as SolicitudLista;
    expect(getEncargadoNombre(sol)).toBeNull();
    expect(getEncargadoId(sol)).toBeNull();
  });
});

describe('SolicitudesService.getUsuarioRolSucursal', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_rol_y_sucursal_del_usuario', async () => {
    admin.results.usuario = [fila({ rol: 'ejecutivo', sucursal_id: 3 })];
    const res = await SolicitudesService.getUsuarioRolSucursal(adminClient, USUARIO_ID);
    expect(res).toEqual({ rol: 'ejecutivo', sucursal_id: 3 });
    expect(admin.callsTo('usuario')).toContainEqual(['select', 'rol, sucursal_id']);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', USUARIO_ID]);
  });

  it('should_devolver_null_cuando_no_hay_usuario', async () => {
    admin.results.usuario = [fila(null)];
    const res = await SolicitudesService.getUsuarioRolSucursal(adminClient, USUARIO_ID);
    expect(res).toBeNull();
  });

  it('should_devolver_null_con_error_de_bd', async () => {
    admin.results.usuario = [errorResult('boom')];
    const res = await SolicitudesService.getUsuarioRolSucursal(adminClient, USUARIO_ID);
    expect(res).toBeNull();
  });
});

describe('SolicitudesService.getJefeLocalDeSucursal', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_id_del_jefe_local', async () => {
    admin.results.usuario = [fila([{ id: 'u-9' }])];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBe('u-9');
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'rol', 'jefe_local']);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'sucursal_id', 5]);
  });

  it('should_devolver_id_cuando_es_encargado_via_sucursal_usuario_id', async () => {
    admin.results.usuario = [fila([]), fila({ id: 'u-22' })];
    admin.results.sucursal = [fila({ usuario_id: 'u-22' })];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBe('u-22');
    expect(admin.callsTo('sucursal')).toContainEqual(['eq', 'id', 5]);
  });

  it('should_devolver_id_cuando_esta_en_tabla_usuario_sucursal', async () => {
    admin.results.usuario = [fila([]), fila([{ id: 'u-33' }])];
    admin.results.sucursal = [fila({ usuario_id: null })];
    admin.results.usuario_sucursal = [fila([{ usuario_id: 'u-33' }])];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBe('u-33');
    expect(admin.callsTo('usuario_sucursal')).toContainEqual(['eq', 'sucursal_id', 5]);
  });

  it('should_ignorar_encargado_que_no_es_jefe_local_y_continuar', async () => {
    admin.results.usuario = [fila([]), fila(null), fila([{ id: 'u-44' }])];
    admin.results.sucursal = [fila({ usuario_id: 'u-44' })];
    admin.results.usuario_sucursal = [fila([{ usuario_id: 'u-44' }])];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBe('u-44');
  });

  it('should_devolver_null_sin_jefe_local', async () => {
    admin.results.usuario = [fila([])];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBeNull();
  });

  it('should_devolver_null_con_error_de_bd', async () => {
    admin.results.usuario = [errorResult('boom')];
    const res = await SolicitudesService.getJefeLocalDeSucursal(5);
    expect(res).toBeNull();
  });
});

describe('SolicitudesService.getSolicitudes', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_mapear_solicitudes_completas', async () => {
    admin.results.solicitud = [
      fila([
        rawRow({
          ejecutivo: { nombre: 'Ana', apellido: 'Pérez' },
        }),
      ]),
    ];
    const res = await SolicitudesService.getSolicitudes();
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('s-1');
    expect(res[0].sucursal_nombre).toBe('Sucursal Norte');
    expect(res[0].sucursal_destino_nombre).toBe('Sucursal Sur');
    expect(res[0].ejecutivo_nombre).toBe('Ana Pérez');
    expect(res[0].vehiculos[0]).toEqual({
      solicitud_vehiculo_id: 'sv-1',
      disponibilidad: 'reservado',
      patente: 'ABC123',
      chasis: 'WBA3A5C50FF123456',
      marca: 'Toyota',
      modelo: 'Corolla',
      anio: 2020,
      color: 'Rojo',
    });
  });

  it('should_devolver_lista_vacia_con_error_de_bd', async () => {
    admin.results.solicitud = [errorResult('boom')];
    const res = await SolicitudesService.getSolicitudes();
    expect(res).toEqual([]);
  });

  it('should_ignorar_vehiculos_sin_relacion', async () => {
    admin.results.solicitud = [
      fila([
        rawRow({
          solicitud_vehiculo: [{ id: 'sv-2', disponibilidad: 'liberado', vehiculo: null }],
        }),
      ]),
    ];
    const res = await SolicitudesService.getSolicitudes();
    expect(res[0].vehiculos).toEqual([]);
  });
});

describe('SolicitudesService.getVehiculosInventario', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_marcar_reservados_activos_y_excluir_vendidos', async () => {
    admin.results.vehiculo = [
      fila([
        { id: 'v1', chasis: 'WBA3A5C50FF123456', patente: 'AAA111', marca: 'Toyota', modelo: 'Corolla', anio: 2020, color: 'Rojo', ubicacion: 1 },
        { id: 'v2', chasis: 'WBA3A5C50FF123457', patente: 'BBB222', marca: 'Honda', modelo: 'Civic', anio: 2021, color: 'Negro', ubicacion: 1 },
        { id: 'v3', chasis: 'WBA3A5C50FF123458', patente: 'CCC333', marca: 'Ford', modelo: 'Focus', anio: 2019, color: 'Blanco', ubicacion: 2 },
      ]),
    ];
    admin.results.solicitud_vehiculo = [fila([{ vehiculo_id: 'v1' }]), fila([{ vehiculo_id: 'v3' }])];
    const res = await SolicitudesService.getVehiculosInventario();
    const map = new Map(res.map((v) => [v.id, v]));
    expect(res).toHaveLength(2);
    expect(map.get('v1')?.reservado_en_activa).toBe(true);
    expect(map.get('v2')?.reservado_en_activa).toBe(false);
    expect(map.has('v3')).toBe(false);
  });

  it('should_devolver_lista_vacia_con_error_en_vehiculos', async () => {
    admin.results.vehiculo = [errorResult('boom')];
    const res = await SolicitudesService.getVehiculosInventario();
    expect(res).toEqual([]);
  });

  it('should_continuar_sin_reservas_si_la_consulta_de_reservas_falla', async () => {
    admin.results.vehiculo = [
      fila([{ id: 'v1', chasis: 'WBA3A5C50FF123456', patente: 'AAA111', marca: 'Toyota', modelo: 'Corolla', anio: 2020, color: 'Rojo', ubicacion: 1 }]),
    ];
    admin.results.solicitud_vehiculo = [errorResult('boom'), fila([])];
    const res = await SolicitudesService.getVehiculosInventario();
    expect(res).toHaveLength(1);
    expect(res[0].reservado_en_activa).toBe(false);
  });
});

describe('SolicitudesService.getSolicitudById', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_solicitud_minima', async () => {
    admin.results.solicitud = [fila(minimo())];
    const res = await SolicitudesService.getSolicitudById('s-1');
    expect(res).toMatchObject({ id: 's-1', estado: 'pendiente', sucursal: 1 });
  });

  it('should_devolver_null_si_no_existe', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.getSolicitudById('s-1');
    expect(res).toBeNull();
  });

  it('should_devolver_null_con_error_de_bd', async () => {
    admin.results.solicitud = [errorResult('boom')];
    const res = await SolicitudesService.getSolicitudById('s-1');
    expect(res).toBeNull();
  });
});

describe('SolicitudesService.getSolicitudCompleta', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_mapear_solicitud_completa', async () => {
    admin.results.solicitud = [fila(rawRow())];
    const res = await SolicitudesService.getSolicitudCompleta('s-1');
    expect(res?.id).toBe('s-1');
    expect(res?.sucursal_nombre).toBe('Sucursal Norte');
  });

  it('should_devolver_null_si_no_existe', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.getSolicitudCompleta('s-1');
    expect(res).toBeNull();
  });
});

describe('SolicitudesService.createSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_sin_vehiculos', async () => {
    const res = await SolicitudesService.createSolicitud({ sucursal: 1, tipo_solicitud: 'venta', ejecutivo_id: USUARIO_ID }, [], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/al menos un vehículo/);
    expect(admin.calls).toHaveLength(0);
  });

  it('should_crear_solicitud_de_venta_con_reserva_y_slots', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), fila(null)];
    admin.results.sucursal = [fila({ slots: 5, slots_ocupados: 1 })];
    admin.results.solicitud = [fila({ id: 's-nueva' }), fila(rawRow({ id: 's-nueva' }))];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      {
        sucursal: 1,
        sucursal_destino: 2,
        tipo_solicitud: 'venta',
        ejecutivo_id: USUARIO_ID,
        fecha_limite: ' 2026-02-01 ',
        observacion: ' entrega rápida ',
      },
      ['v-1', 'v-2'],
      USUARIO_ID
    );

    expect(res.success).toBe(true);
    expect(res.solicitud?.id).toBe('s-nueva');
    const insert = admin.callsTo('solicitud').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toMatchObject({
      sucursal: 1,
      sucursal_destino: 2,
      tipo_solicitud: 'venta',
      estado: 'pendiente_aprobacion',
      ejecutivo_id: USUARIO_ID,
      fecha_limite: '2026-02-01',
    });
    const svInsert = admin.callsTo('solicitud_vehiculo').find((c) => c[0] === 'insert');
    expect(svInsert?.[1]).toEqual([
      { solicitud_id: 's-nueva', vehiculo_id: 'v-1', disponibilidad: 'reservado' },
      { solicitud_id: 's-nueva', vehiculo_id: 'v-2', disponibilidad: 'reservado' },
    ]);
    const obs = admin.callsTo('observacion').find((c) => c[0] === 'insert');
    expect(obs?.[1]).toEqual({ solicitud_id: 's-nueva', usuario_id: USUARIO_ID, observacion: 'entrega rápida' });
  });

  it('should_para_evento_guardar_direccion_y_titulo_sin_sucursal_destino', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), fila(null)];
    admin.results.solicitud = [fila({ id: 's-evento' }), fila(rawRow({ id: 's-evento', sucursal_destino: null }))];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      {
        sucursal: 1,
        tipo_solicitud: 'evento',
        direccion_evento: ' Av. Siempre Viva ',
        titulo_evento: ' Entrega showroom ',
      },
      ['v-1'],
      USUARIO_ID
    );

    expect(res.success).toBe(true);
    const insert = admin.callsTo('solicitud').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toMatchObject({
      sucursal: 1,
      tipo_solicitud: 'evento',
      direccion_evento: 'Av. Siempre Viva',
      titulo_evento: 'Entrega showroom',
    });
    expect(insert?.[1]).not.toHaveProperty('sucursal_destino');
  });

  it('should_rechazar_vehiculos_reservados_en_otra_solicitud', async () => {
    admin.results.solicitud_vehiculo = [fila([{ vehiculo_id: 'v-1' }])];
    const res = await SolicitudesService.createSolicitud({ sucursal: 1, tipo_solicitud: 'venta' }, ['v-1'], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Uno o más vehículos seleccionados ya están reservados en otra solicitud activa.');
  });

  it('should_auditar_la_delegacion_when_hay_ejecutivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), fila(null)];
    admin.results.solicitud = [fila({ id: 's-delegada' }), fila(rawRow({ id: 's-delegada' }))];
    const spy = spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      { sucursal: 1, sucursal_destino: 2, tipo_solicitud: 'venta', ejecutivo_id: 'e-9', jefe_local_id: 'jefe-1' },
      ['v-1'],
      'jefe-1'
    );

    expect(res.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      'jefe-1',
      'solicitud',
      's-delegada',
      'delegacion',
      null,
      { ejecutivo_id: 'e-9', jefe_local_id: 'jefe-1' }
    );
  });

  it('should_no_auditar_delegacion_when_el_jefe_se_queda_con_la_solicitud', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), fila(null)];
    admin.results.solicitud = [fila({ id: 's-sin-delegar' }), fila(rawRow({ id: 's-sin-delegar' }))];
    const spy = spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      { sucursal: 1, sucursal_destino: 2, tipo_solicitud: 'venta', ejecutivo_id: null, jefe_local_id: 'jefe-1' },
      ['v-1'],
      'jefe-1'
    );

    expect(res.success).toBe(true);
    expect(spy.mock.calls.some((c) => c[3] === 'delegacion')).toBe(false);
  });

  it('should_crear_solicitud_aunque_destino_este_sin_slots_disponibles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), fila(null)];
    admin.results.solicitud = [fila({ id: 's-sin-slots' }), fila(rawRow({ id: 's-sin-slots' }))];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      { sucursal: 1, sucursal_destino: 2, tipo_solicitud: 'venta' },
      ['v-1'],
      USUARIO_ID
    );

    expect(res.success).toBe(true);
    expect(res.solicitud?.id).toBe('s-sin-slots');
    expect(admin.callsTo('sucursal')).toHaveLength(0);
  });

  it('should_rechazar_si_falla_la_verificacion_de_disponibilidad', async () => {
    admin.results.solicitud_vehiculo = [errorResult('sin conexión')];
    const res = await SolicitudesService.createSolicitud({ sucursal: 1, tipo_solicitud: 'venta' }, ['v-1'], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No se pudo verificar la disponibilidad de los vehículos: sin conexión/);
  });

  it('should_revertir_solicitud_si_falla_la_reserva_de_vehiculos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud_vehiculo = [fila([]), errorResult('viola unique')];
    admin.results.sucursal = [fila({ slots: 5, slots_ocupados: 1 })];
    admin.results.solicitud = [fila({ id: 's-x' }), fila(null)];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.createSolicitud(
      { sucursal: 1, sucursal_destino: 2, tipo_solicitud: 'venta' },
      ['v-1'],
      USUARIO_ID
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No se pudo reservar los vehículos: viola unique/);
    const del = admin.callsTo('solicitud').find((c) => c[0] === 'delete');
    expect(del).toBeDefined();
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'id', 's-x']);
  });
});

describe('SolicitudesService.priorizarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'Solicitud no encontrada.' });
  });

  it('should_rechazar_estado_no_priorizable', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo las solicitudes Pendientes o Aprobadas pueden priorizarse.');
  });

  it('should_priorizar_al_inicio_con_cola_vacia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo()), fila([]), fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true, posicion: 1 });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toEqual({ estado: 'priorizada', posicion_prioridad: 1 });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_priorizar_despues_de_la_ultima_posicion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo()),
      fila([
        { id: 'b', posicion_prioridad: 1 },
        { id: 'c', posicion_prioridad: 2 },
      ]),
      fila(null),
    ];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true, posicion: 3 });
  });

  it('should_sanear_cola_con_posiciones_negativas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo()),
      fila([
        { id: 'a', posicion_prioridad: -1 },
        { id: 'b', posicion_prioridad: 2 },
      ]),
      fila(null),
      fila(null),
      fila(null),
      fila(null),
    ];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true, posicion: 3 });
  });

  it('should_devolver_error_de_bd_al_actualizar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo()), fila([]), errorResult('boom')];
    const res = await SolicitudesService.priorizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.reordenarCola', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_orden_vacio', async () => {
    const res = await SolicitudesService.reordenarCola(1, [], USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'El orden de la cola no puede estar vacío.' });
  });

  it('should_rechazar_orden_con_duplicados', async () => {
    const res = await SolicitudesService.reordenarCola(1, ['a', 'a'], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('El orden de la cola contiene elementos duplicados.');
  });

  it('should_rechazar_si_faltan_solicitudes', async () => {
    admin.results.solicitud = [fila([{ id: 'a', estado: 'priorizada' }])];
    const res = await SolicitudesService.reordenarCola(1, ['a', 'b'], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Algunas solicitudes del orden no existen.');
  });

  it('should_rechazar_solicitudes_no_priorizadas', async () => {
    admin.results.solicitud = [
      fila([
        { id: 'a', estado: 'pendiente' },
        { id: 'b', estado: 'priorizada' },
      ]),
    ];
    const res = await SolicitudesService.reordenarCola(1, ['a', 'b'], USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo solicitudes priorizadas pueden reordenarse en la cola.');
  });

  it('should_reescribir_cola_y_auditar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila([
        { id: 'a', estado: 'priorizada' },
        { id: 'b', estado: 'priorizada' },
      ]),
      fila([
        { id: 'a', posicion_prioridad: 1 },
        { id: 'b', posicion_prioridad: 2 },
      ]),
      fila(null),
      fila(null),
      fila(null),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.reordenarCola(1, ['b', 'a'], USUARIO_ID);
    expect(res).toEqual({ success: true });
    expect(auditoria).toHaveBeenCalledWith(expect.anything(), 'solicitud_cola', 'sucursal_1', 'reorden_cola', expect.anything(), expect.anything());
  });
});

describe('SolicitudesService.priorizarEnPosicion', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_posicion_invalida', async () => {
    const res = await SolicitudesService.priorizarEnPosicion('s-1', 0, USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('La posición debe ser un entero mayor o igual a 1.');
  });

  it('should_rechazar_solicitud_no_encontrada', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.priorizarEnPosicion('s-1', 1, USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_solicitud_no_priorizable', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    const res = await SolicitudesService.priorizarEnPosicion('s-1', 1, USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo las solicitudes Pendientes o Aprobadas pueden priorizarse.');
  });

  it('should_rechazar_posicion_mas_alla_del_final', async () => {
    admin.results.solicitud = [
      fila(minimo({ sucursal: 1 })),
      fila([{ id: 'c', posicion_prioridad: 1 }]),
    ];
    const res = await SolicitudesService.priorizarEnPosicion('s-1', 3, USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('La posición máxima válida es 2.');
  });

  it('should_insertar_en_la_posicion_y_reescribir_la_cola', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ sucursal: 1 })),
      fila([
        { id: 'c1', posicion_prioridad: 1 },
        { id: 'c2', posicion_prioridad: 2 },
      ]),
      fila(null),
      fila(null),
      fila(null),
      fila(null),
      fila(null),
    ];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.priorizarEnPosicion('s-1', 2, USUARIO_ID);
    expect(res).toEqual({ success: true, posicion: 2 });
    const stateUpdate = admin.callsTo('solicitud').filter((c) => c[0] === 'update');
    expect(stateUpdate[0]?.[1]).toEqual({ estado: 'priorizada' });
  });
});

describe('SolicitudesService.sacarDeCola', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.sacarDeCola('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_solicitud_no_priorizada', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'pendiente' }))];
    const res = await SolicitudesService.sacarDeCola('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes priorizadas pueden salir de la cola.');
  });

  it('should_sacar_de_la_cola_y_auditar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'priorizada', posicion_prioridad: 2, sucursal: 1 })),
      fila(null),
      fila(null),
      fila([]),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.sacarDeCola('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').filter((c) => c[0] === 'update');
    expect(update[0]?.[1]).toEqual({ estado: 'aprobada', posicion_prioridad: null });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_devolver_error_de_bd_al_actualizar', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' })), errorResult('boom')];
    const res = await SolicitudesService.sacarDeCola('s-1', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.getColaPriorizada', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_cola_mapeada', async () => {
    admin.results.solicitud = [
      fila([
        { id: 'a', posicion_prioridad: 2 },
        { id: 'b', posicion_prioridad: 5 },
      ]),
    ];
    const res = await SolicitudesService.getColaPriorizada(1);
    expect(res).toEqual([
      { id: 'a', posicion_prioridad: 2 },
      { id: 'b', posicion_prioridad: 5 },
    ]);
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'estado', 'priorizada']);
  });

  it('should_devolver_vacio_con_error', async () => {
    admin.results.solicitud = [errorResult('boom')];
    const res = await SolicitudesService.getColaPriorizada(1);
    expect(res).toEqual([]);
  });
});

describe('SolicitudesService.cancelarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.cancelarSolicitud('s-1', 'motivo', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_post_despacho', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    const res = await SolicitudesService.cancelarSolicitud('s-1', 'motivo', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('No se puede cancelar una solicitud en estado "en_transito".');
  });

  it('should_cancelar_sin_posicion_y_auditar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo()), fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.cancelarSolicitud('s-1', '  cambio de planes  ', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toEqual({ estado: 'cancelada', motivo_cancelacion: 'cambio de planes', posicion_prioridad: null });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_renumerar_cola_al_cancelar_con_posicion', async () => {
    admin.results.solicitud = [
      fila(minimo({ posicion_prioridad: 3, sucursal: 1 })),
      fila(null),
      fila(null),
      fila([]),
    ];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.cancelarSolicitud('s-1', 'cambio de planes', USUARIO_ID);
    expect(res).toEqual({ success: true });
  });
});

describe('SolicitudesService.eliminarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.eliminarSolicitud('s-1');
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_post_despacho', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.eliminarSolicitud('s-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo se pueden eliminar solicitudes pre-despacho.');
  });

  it('should_eliminar_y_borrar_de_la_base', async () => {
    admin.results.solicitud = [fila(minimo()), fila(null)];
    const res = await SolicitudesService.eliminarSolicitud('s-1');
    expect(res).toEqual({ success: true });
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'id', 's-1']);
  });

  it('should_devolver_error_de_bd_al_eliminar', async () => {
    admin.results.solicitud = [fila(minimo()), errorResult('boom')];
    const res = await SolicitudesService.eliminarSolicitud('s-1');
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.aprobarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_fecha_vacia', async () => {
    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, '   ');
    expect(res.error).toBe('Debes indicar la fecha de entrega para aprobar la solicitud.');
  });

  it('should_rechazar_fecha_invalida', async () => {
    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, 'no-es-fecha');
    expect(res.error).toBe('La fecha de entrega no es válida.');
  });

  it('should_rechazar_fecha_anterior_a_hoy', async () => {
    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, '2000-01-01');
    expect(res.error).toBe('La fecha de entrega no puede ser anterior al día de hoy.');
  });

  it('should_rechazar_estado_no_pendiente', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'aprobada' }))];
    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, '2099-01-01');
    expect(res.error).toBe('Solo se pueden aprobar solicitudes pendientes de aprobación.');
  });

  it('should_aprobar_y_guardar_fechas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo({ estado: 'pendiente_aprobacion' })), fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, ' 2099-01-01 ');
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toMatchObject({ estado: 'aprobada', fecha_limite: '2099-01-01' });
    // El servicio registra la fecha de confirmación explícitamente (no depende
    // solo del trigger `tr_registrar_fechas_flujo`).
    expect((update?.[1] as { fecha_confirmacion?: unknown }).fecha_confirmacion).toEqual(
      expect.any(String)
    );
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.rechazarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.rechazarSolicitud('s-1', 'motivo suficiente', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_motivo_corto', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'pendiente_aprobacion' }))];
    const res = await SolicitudesService.rechazarSolicitud('s-1', 'no', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('El motivo de rechazo debe tener al menos 5 caracteres.');
  });

  it('should_rechazar_solo_pendientes', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'entregada' }))];
    const res = await SolicitudesService.rechazarSolicitud('s-1', 'motivo suficiente', USUARIO_ID);
    expect(res.error).toBe('Solo se pueden rechazar solicitudes pendientes de aprobación.');
  });

  it('should_cambiar_estado_y_guardar_observacion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo({ estado: 'pendiente_aprobacion' })), fila(null)];
    admin.results.observacion = [fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.rechazarSolicitud('s-1', ' no cumple requisitos ', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const obs = admin.callsTo('observacion').find((c) => c[0] === 'insert');
    expect(obs?.[1]).toEqual({
      solicitud_id: 's-1',
      usuario_id: USUARIO_ID,
      observacion: '[RECHAZO] no cumple requisitos',
    });
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.agregarObservacion', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_observacion_vacia', async () => {
    const res = await SolicitudesService.agregarObservacion('s-1', USUARIO_ID, '   ');
    expect(res.error).toBe('La observación no puede estar vacía.');
  });

  it('should_insertar_observacion', async () => {
    admin.results.observacion = [fila(null)];
    const res = await SolicitudesService.agregarObservacion('s-1', USUARIO_ID, '  cliente pidió llamado ');
    expect(res).toEqual({ success: true });
    const insert = admin.callsTo('observacion').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toEqual({ solicitud_id: 's-1', usuario_id: USUARIO_ID, observacion: 'cliente pidió llamado' });
  });

  it('should_devolver_error_de_bd', async () => {
    admin.results.observacion = [errorResult('boom')];
    const res = await SolicitudesService.agregarObservacion('s-1', USUARIO_ID, 'ok');
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.getObservaciones', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_mapear_con_nombre_de_usuario', async () => {
    admin.results.observacion = [
      fila([
        {
          id: 'o-1',
          solicitud_id: 's-1',
          usuario_id: 'u-1',
          observacion: 'ok',
          created_at: '2026-01-01T10:00:00Z',
          usuario: { nombre: 'Ana', apellido: 'Pérez' },
        },
      ]),
    ];
    const res = await SolicitudesService.getObservaciones('s-1');
    expect(res[0]).toMatchObject({ id: 'o-1', observacion: 'ok', usuario_nombre: 'Ana Pérez' });
  });

  it('should_devolver_vacio_con_error', async () => {
    admin.results.observacion = [errorResult('boom')];
    const res = await SolicitudesService.getObservaciones('s-1');
    expect(res).toEqual([]);
  });
});

describe('SolicitudesService.getAuditoria', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_mapear_entradas_con_usuario', async () => {
    admin.results.auditoria = [
      fila([
        {
          id: 'a-1',
          usuario_id: 'u-1',
          entidad: 'solicitud',
          entidad_id: 's-1',
          accion: 'aprobacion',
          valor_anterior: { estado: 'pendiente_aprobacion' },
          valor_nuevo: { estado: 'aprobada' },
          created_at: '2026-01-01T10:00:00Z',
          usuario: { nombre: 'Ana', apellido: 'Pérez' },
        },
      ]),
    ];
    const res = await SolicitudesService.getAuditoria('s-1');
    expect(res[0]).toMatchObject({ id: 'a-1', accion: 'aprobacion', usuario_nombre: 'Ana Pérez' });
    expect(res[0].valor_anterior).toEqual({ estado: 'pendiente_aprobacion' });
  });

  it('should_devolver_vacio_con_error', async () => {
    admin.results.auditoria = [errorResult('boom')];
    const res = await SolicitudesService.getAuditoria('s-1');
    expect(res).toEqual([]);
  });
});

describe('SolicitudesService.subirDocumentos', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_rechazar_sin_archivos', async () => {
    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, []);
    expect(res).toEqual({ success: false, error: 'No se seleccionaron archivos.' });
  });

  it('should_rechazar_si_la_solicitud_no_existe', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo()]);
    expect(res).toEqual({ success: false, error: 'La solicitud no existe.' });
  });

  it('should_rechazar_archivo_vacio', async () => {
    admin.results.solicitud = [fila(minimo())];
    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo({ tamano: 0 })]);
    expect(res.error).toBe('El archivo "documento.pdf" está vacío.');
  });

  it('should_rechazar_archivo_demasiado_grande', async () => {
    admin.results.solicitud = [fila(minimo())];
    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo({ tamano: 11 * 1024 * 1024 })]);
    expect(res.error).toBe('El archivo "documento.pdf" supera el máximo de 10 MB.');
  });

  it('should_rechazar_mime_no_permitido', async () => {
    admin.results.solicitud = [fila(minimo())];
    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo({ tipo: 'image/gif' })]);
    expect(res.error).toBe('El tipo del archivo "documento.pdf" no está permitido.');
  });

  it('should_subir_e_insertar_registro', async () => {
    admin.results.solicitud = [fila(minimo())];
    admin.results[BUCKET] = [fila(null)];
    admin.results.solicitud_documento = [fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo()]);
    expect(res).toEqual({ success: true, subidos: 1 });

    const uploads = admin.callsTo(BUCKET);
    expect(uploads[0][0]).toBe('upload');
    const ruta = uploads[0][1] as string;
    expect(ruta.startsWith('s-1/')).toBe(true);
    expect(ruta.endsWith('-documento.pdf')).toBe(true);
    expect(uploads[0][3]).toEqual({ contentType: 'application/pdf', upsert: false });

    const insert = admin.callsTo('solicitud_documento').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toMatchObject({
      solicitud_id: 's-1',
      nombre_archivo: 'documento.pdf',
      tipo_mime: 'application/pdf',
      tamano_bytes: 1024,
      subido_por: USUARIO_ID,
      ruta_storage: ruta,
    });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_remover_envios_parciales_si_un_insert_falla', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo())];
    admin.results[BUCKET] = [fila(null), errorResult('storage caído')];
    admin.results.solicitud_documento = [errorResult('viola unique')];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.subirDocumentos('s-1', USUARIO_ID, [archivo()]);
    expect(res.success).toBe(false);
    expect(res.error).toBe('viola unique');

    const remove = admin.callsTo(BUCKET).find((c) => c[0] === 'remove');
    expect(remove).toBeDefined();
    const ruta = admin.callsTo(BUCKET)[0][1];
    expect(remove?.[1]).toEqual([ruta]);
  });
});

describe('SolicitudesService.getDocumentos', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_mapear_documentos_con_subido_por', async () => {
    admin.results.solicitud_documento = [
      fila([
        {
          id: 'd-1',
          solicitud_id: 's-1',
          nombre_archivo: 'doc.pdf',
          tipo_mime: 'application/pdf',
          tamano_bytes: 100,
          ruta_storage: 's/1/doc.pdf',
          subido_por: 'u-1',
          created_at: '2026-01-01T10:00:00Z',
          usuario: { nombre: 'Ana', apellido: 'Pérez' },
        },
      ]),
    ];
    const res = await SolicitudesService.getDocumentos('s-1');
    expect(res[0]).toMatchObject({ id: 'd-1', nombre_archivo: 'doc.pdf', subido_por_nombre: 'Ana Pérez' });
  });

  it('should_devolver_vacio_con_error', async () => {
    admin.results.solicitud_documento = [errorResult('boom')];
    const res = await SolicitudesService.getDocumentos('s-1');
    expect(res).toEqual([]);
  });
});

describe('SolicitudesService.eliminarDocumento', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_existe', async () => {
    admin.results.solicitud_documento = [errorResult('no existe')];
    const res = await SolicitudesService.eliminarDocumento('d-1', USUARIO_ID, 'ejecutivo');
    expect(res).toEqual({ success: false, error: 'El documento no existe.' });
  });

  it('should_denegar_sin_permisos', async () => {
    admin.results.solicitud_documento = [
      fila({ id: 'd-1', solicitud_id: 's-1', ruta_storage: 'r', nombre_archivo: 'doc.pdf', subido_por: 'otro' }),
    ];
    const res = await SolicitudesService.eliminarDocumento('d-1', USUARIO_ID, 'ejecutivo');
    expect(res.success).toBe(false);
    expect(res.error).toBe('No tienes permisos para eliminar este documento.');
    expect(admin.callsTo(BUCKET)).toHaveLength(0);
  });

  it('should_permitir_eliminar_al_propietario', async () => {
    admin.results.solicitud_documento = [
      fila({ id: 'd-1', solicitud_id: 's-1', ruta_storage: 'r', nombre_archivo: 'doc.pdf', subido_por: USUARIO_ID }),
      fila(null),
    ];
    admin.results[BUCKET] = [fila(null)];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.eliminarDocumento('d-1', USUARIO_ID, 'ejecutivo');
    expect(res).toEqual({ success: true });
    expect(admin.callsTo(BUCKET)).toContainEqual(['remove', ['r']]);
    expect(admin.callsTo('solicitud_documento')).toContainEqual(['delete']);
  });

  it('should_eliminar_como_administrador', async () => {
    admin.results.solicitud_documento = [
      fila({ id: 'd-1', solicitud_id: 's-1', ruta_storage: 'r', nombre_archivo: 'doc.pdf', subido_por: 'otro' }),
      fila(null),
    ];
    admin.results[BUCKET] = [fila(null)];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.eliminarDocumento('d-1', USUARIO_ID, 'administrador');
    expect(res).toEqual({ success: true });
  });
});

describe('SolicitudesService.getURLDescarga', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_existe', async () => {
    admin.results.solicitud_documento = [errorResult('no existe')];
    const res = await SolicitudesService.getURLDescarga('d-1');
    expect(res).toEqual({ success: false, error: 'El documento no existe.' });
  });

  it('should_generar_url_firmada', async () => {
    admin.results.solicitud_documento = [fila({ ruta_storage: 'ruta/1' })];
    admin.results[BUCKET] = [fila({ signedUrl: 'https://cdn/archivo.pdf' })];
    const res = await SolicitudesService.getURLDescarga('d-1');
    expect(res).toEqual({ success: true, url: 'https://cdn/archivo.pdf' });
    expect(admin.callsTo(BUCKET)).toContainEqual(['createSignedUrl', 'ruta/1', 300]);
  });

  it('should_devolver_error_si_falla_la_firma', async () => {
    admin.results.solicitud_documento = [fila({ ruta_storage: 'ruta/1' })];
    admin.results[BUCKET] = [errorResult('no firmado')];
    const res = await SolicitudesService.getURLDescarga('d-1');
    expect(res.success).toBe(false);
    expect(res.error).toBe('no firmado');
  });
});

describe('SolicitudesService.registrarAuditoria', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_insertar_entrada_con_valores', async () => {
    admin.results.auditoria = [fila(null)];
    await SolicitudesService.registrarAuditoria(
      'u-1',
      'solicitud',
      's-1',
      'CAMBIO_ESTADO',
      { estado: 'pendiente' },
      { estado: 'aprobada' }
    );
    const insert = admin.callsTo('auditoria').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toEqual({
      usuario_id: 'u-1',
      entidad: 'solicitud',
      entidad_id: 's-1',
      accion: 'CAMBIO_ESTADO',
      valor_anterior: { estado: 'pendiente' },
      valor_nuevo: { estado: 'aprobada' },
    });
  });

  it('should_guardar_null_sin_valores_previos', async () => {
    admin.results.auditoria = [fila(null)];
    await SolicitudesService.registrarAuditoria('u-1', 'solicitud', 's-1', 'prueba');
    const insert = admin.callsTo('auditoria').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toMatchObject({ valor_anterior: null, valor_nuevo: null });
  });

  it('should_no_lanzar_con_error_de_bd', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.auditoria = [errorResult('boom')];
    await expect(SolicitudesService.registrarAuditoria('u-1', 'solicitud', 's-1', 'prueba')).resolves.toBeUndefined();
  });
});

describe('SolicitudesService.getEjecutivosPorSucursal', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_filtrar_por_sucursal', async () => {
    admin.results.usuario = [fila([{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez' }])];
    const res = await SolicitudesService.getEjecutivosPorSucursal(3);
    expect(res).toEqual([{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez' }]);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'sucursal_id', 3]);
  });

  it('should_no_filtrar_por_sucursal_si_es_null', async () => {
    admin.results.usuario = [fila([{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez' }])];
    const res = await SolicitudesService.getEjecutivosPorSucursal(null);
    expect(res).toHaveLength(1);
    expect(admin.callsTo('usuario').some((c) => c[0] === 'eq' && c[1] === 'sucursal_id')).toBe(false);
  });

  it('should_devolver_vacio_con_error', async () => {
    admin.results.usuario = [errorResult('boom')];
    const res = await SolicitudesService.getEjecutivosPorSucursal(3);
    expect(res).toEqual([]);
  });
});

describe('SolicitudesService.validarEjecutivoDelegable', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Ejecutivo por defecto: rol correcto, activo y de la sucursal 3. */
  function ejecutivo(overrides: Record<string, unknown> = {}) {
    return fila({ id: 'e-1', rol: 'ejecutivo', activo: true, sucursal_id: 3, ...overrides });
  }

  it('should_devolver_null_when_ejecutivo_es_delegable', async () => {
    admin.results.usuario = [ejecutivo()];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toBeNull();
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'e-1']);
  });

  it('should_rechazar_when_el_ejecutivo_no_existe', async () => {
    admin.results.usuario = [fila(null)];
    const res = await SolicitudesService.validarEjecutivoDelegable('fantasma', 3);
    expect(res).toBe('El ejecutivo seleccionado no existe.');
  });

  it('should_rechazar_when_el_rol_no_es_ejecutivo', async () => {
    admin.results.usuario = [ejecutivo({ rol: 'logistica' })];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toMatch(/rol Ejecutivo/);
  });

  it('should_rechazar_when_el_ejecutivo_esta_inactivo', async () => {
    admin.results.usuario = [ejecutivo({ activo: false })];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toBe('El ejecutivo seleccionado está inactivo.');
  });

  it('should_rechazar_when_el_ejecutivo_es_de_otra_sucursal', async () => {
    admin.results.usuario = [ejecutivo({ sucursal_id: 9 })];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toMatch(/sucursal de origen/);
  });

  it('should_rechazar_when_el_ejecutivo_no_tiene_sucursal', async () => {
    admin.results.usuario = [ejecutivo({ sucursal_id: null })];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toMatch(/sucursal de origen/);
  });

  it('should_devolver_error_cuando_falla_la_consulta', async () => {
    admin.results.usuario = [errorResult('boom')];
    const res = await SolicitudesService.validarEjecutivoDelegable('e-1', 3);
    expect(res).toBe('No se pudo verificar el ejecutivo seleccionado.');
  });
});

describe('SolicitudesService.agregarVehiculo', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_post_despacho', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);
    expect(res.error).toBe('Los vehículos solo se gestionan pre-despacho.');
  });

  it('should_rechazar_vehiculo_reservado_en_otra_solicitud', async () => {
    admin.results.solicitud = [fila(minimo({ tipo_solicitud: 'evento' }))];
    admin.results.solicitud_vehiculo = [fila([{ id: 'x-1' }])];
    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Ese vehículo ya está reservado en otra solicitud activa.');
  });

  it('should_agregar_vehiculo_aunque_destino_este_sin_slots_disponibles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo())];
    admin.results.solicitud_vehiculo = [fila([]), fila({ id: 'sv-nuevo' })];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);

    expect(res).toEqual({ success: true });
    expect(auditoria).toHaveBeenCalled();
    expect(admin.callsTo('sucursal')).toHaveLength(0);
  });

  it('should_reservar_vehiculo_y_auditar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo())];
    admin.results.solicitud_vehiculo = [fila([]), fila({ id: 'sv-nuevo' })];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const insert = admin.callsTo('solicitud_vehiculo').filter((c) => c[0] === 'insert');
    expect(insert[0]?.[1]).toEqual({ solicitud_id: 's-1', vehiculo_id: 'v-1', disponibilidad: 'reservado' });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_devolver_error_de_bd_al_insertar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo({ tipo_solicitud: 'evento' }))];
    admin.results.solicitud_vehiculo = [fila([]), errorResult('boom')];
    const res = await SolicitudesService.agregarVehiculo('s-1', 'v-1', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.quitarVehiculo', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_la_reserva_no_existe', async () => {
    admin.results.solicitud_vehiculo = [{ data: null, error: null }];
    const res = await SolicitudesService.quitarVehiculo('sv-1', USUARIO_ID);
    expect(res.error).toBe('Reserva no encontrada.');
  });

  it('should_devolver_error_si_la_solicitud_no_existe', async () => {
    admin.results.solicitud_vehiculo = [fila({ id: 'sv-1', solicitud_id: 's-1', vehiculo_id: 'v-1' })];
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.quitarVehiculo('sv-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_post_despacho', async () => {
    admin.results.solicitud_vehiculo = [fila({ id: 'sv-1', solicitud_id: 's-1', vehiculo_id: 'v-1' })];
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    const res = await SolicitudesService.quitarVehiculo('sv-1', USUARIO_ID);
    expect(res.error).toBe('Los vehículos solo se gestionan pre-despacho.');
  });

  it('should_rechazar_liberar_el_ultimo_vehiculo', async () => {
    admin.results.solicitud_vehiculo = [
      fila({ id: 'sv-1', solicitud_id: 's-1', vehiculo_id: 'v-1' }),
      filaConCount(1),
    ];
    admin.results.solicitud = [fila(minimo())];
    const res = await SolicitudesService.quitarVehiculo('sv-1', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Una solicitud debe tener al menos un vehículo asociado.');
  });

  it('should_liberar_vehiculo_y_auditar', async () => {
    admin.results.solicitud_vehiculo = [
      fila({ id: 'sv-1', solicitud_id: 's-1', vehiculo_id: 'v-1' }),
      filaConCount(3),
      fila(null),
    ];
    admin.results.solicitud = [fila(minimo())];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.quitarVehiculo('sv-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    expect(admin.callsTo('solicitud_vehiculo')).toContainEqual(['eq', 'id', 'sv-1']);
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.calendarizarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.calendarizarSolicitud('s-1', '2099-01-01', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_fecha_anterior', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' }))];
    const res = await SolicitudesService.calendarizarSolicitud('s-1', '2000-01-01', USUARIO_ID);
    expect(res.error).toBe('La fecha de despacho no puede ser anterior al día de hoy.');
  });

  it('should_rechazar_estado_no_permitido', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'pendiente' }))];
    const res = await SolicitudesService.calendarizarSolicitud('s-1', '2099-01-01', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes Priorizadas o Asignadas pueden calendarizarse.');
  });

  it('should_calendarizar_y_renumerar_cola', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'priorizada', sucursal: 1, posicion_prioridad: 2 })),
      fila(null),
      fila(null),
      fila([]),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.calendarizarSolicitud('s-1', '2099-01-01', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').filter((c) => c[0] === 'update');
    expect(update[0]?.[1]).toMatchObject({
      estado: 'calendarizada',
      fecha_tentativa_despacho: '2099-01-01',
      logistica_id: USUARIO_ID,
      posicion_prioridad: null,
    });
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.descalendarizarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.descalendarizarSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_no_calendarizado', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' }))];
    const res = await SolicitudesService.descalendarizarSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes Calendarizadas pueden volver a priorizadas.');
  });

  it('should_volver_a_la_cola_al_final', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'calendarizada', sucursal: 1 })),
      fila([{ id: 'c', posicion_prioridad: 1 }]),
      fila(null),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.descalendarizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toMatchObject({
      estado: 'priorizada',
      posicion_prioridad: 2,
      fecha_tentativa_despacho: null,
      logistica_id: null,
    });
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.despacharSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.despacharSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_no_calendarizado', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' }))];
    const res = await SolicitudesService.despacharSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes Calendarizadas pueden despacharse.');
  });

  it('should_despachar_y_renumerar_cola', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'calendarizada', sucursal: 1 })),
      fila(null),
      fila(null),
      fila([]),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.despacharSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toMatchObject({ estado: 'en_transito', posicion_prioridad: null });
    expect(typeof (update?.[1] as Record<string, unknown>).fecha_despacho).toBe('string');
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_devolver_error_de_bd', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' })), errorResult('boom')];
    const res = await SolicitudesService.despacharSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'boom' });
  });
});

describe('SolicitudesService.cancelarDespacharSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.cancelarDespacharSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_no_en_transito', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.cancelarDespacharSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes En Tránsito pueden volver a Calendarizadas.');
  });

  it('should_volver_a_calendarizada_y_auditar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'en_transito', fecha_despacho: '2026-01-01' })),
      fila(null),
    ];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.cancelarDespacharSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toEqual({ estado: 'calendarizada', fecha_despacho: null, posicion_prioridad: null });
    expect(auditoria).toHaveBeenCalled();
  });
});

describe('SolicitudesService.recibirSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_no_en_transito', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes En Tránsito pueden recibirse.');
  });

  it('should_devolver_error_si_el_usuario_no_existe', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    admin.results.usuario = [{ data: null, error: null }];
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Usuario no encontrado.');
  });

  it('should_rechazar_jefe_local_de_otra_sucursal', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    admin.results.usuario = [fila({ rol: 'jefe_local', sucursal_id: 1 })];
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo el jefe de local de la sucursal destino puede recibir la solicitud.');
  });

  it('should_recibir_como_jefe_local_destino', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // El permiso multi-sucursal lo resuelve el RPC `usuario_tiene_sucursal`
    // (principal + sucursal a cargo), no `usuario.sucursal_id`.
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' })), fila(null)];
    admin.results.usuario = [fila({ rol: 'jefe_local', sucursal_id: 2 })];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').filter((c) => c[0] === 'update');
    expect(update[0]?.[1]).toMatchObject({ estado: 'entregada', posicion_prioridad: null });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_recibir_como_administrador_sin_restringir_sucursal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' })), fila(null)];
    admin.results.usuario = [fila({ rol: 'administrador', sucursal_id: 9 })];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
  });
});

describe('SolicitudesService.finalizarSolicitud', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_devolver_error_si_no_se_encuentra', async () => {
    admin.results.solicitud = [{ data: null, error: null }];
    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solicitud no encontrada.');
  });

  it('should_rechazar_estado_no_entregada', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'en_transito' }))];
    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res.error).toBe('Solo las solicitudes Recepcionadas pueden entregarse al cliente.');
  });

  it('should_rechazar_sin_permisos', async () => {
    admin.results.solicitud = [
      fila(minimo({ estado: 'entregada', ejecutivo_id: 'otro', sucursal_destino: 2 })),
    ];
    admin.results.usuario = [fila({ rol: 'ejecutivo', sucursal_id: 1 })];
    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res.success).toBe(false);
    expect(res.error).toBe(
      'Solo el jefe de local de la sucursal destino o el ejecutivo que creó la solicitud pueden finalizarla.'
    );
  });

  it('should_finalizar_como_ejecutivo_creador', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'entregada', ejecutivo_id: USUARIO_ID })),
      fila(null),
    ];
    admin.results.usuario = [fila({ rol: 'ejecutivo', sucursal_id: 1 })];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
    const update = admin.callsTo('solicitud').find((c) => c[0] === 'update');
    expect(update?.[1]).toMatchObject({
      estado: 'finalizada',
      posicion_prioridad: null,
      fecha_entrega_cliente: expect.any(String),
    });
    expect(auditoria).toHaveBeenCalled();
  });

  it('should_finalizar_como_jefe_local_destino', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // El permiso multi-sucursal lo resuelve el RPC `usuario_tiene_sucursal`
    // (principal + sucursal a cargo), no `usuario.sucursal_id`.
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });
    admin.results.solicitud = [
      fila(minimo({ estado: 'entregada', sucursal_destino: 2 })),
      fila(null),
    ];
    admin.results.usuario = [fila({ rol: 'jefe_local', sucursal_id: 2 })];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
  });

  it('should_finalizar_como_administrador', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.solicitud = [
      fila(minimo({ estado: 'entregada' })),
      fila(null),
    ];
    admin.results.usuario = [fila({ rol: 'administrador', sucursal_id: 9 })];
    spyRegistrarAuditoria();
    const res = await SolicitudesService.finalizarSolicitud('s-1', USUARIO_ID);
    expect(res).toEqual({ success: true });
  });
});