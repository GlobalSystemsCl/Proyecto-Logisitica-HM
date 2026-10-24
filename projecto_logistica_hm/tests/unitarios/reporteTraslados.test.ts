import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolicitudLista, VehiculoAsociado } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import {
  FILTROS_MOVIMIENTOS_VACIOS,
  SIN_TRANSPORTISTA,
  diaChile,
  filasExcelCalendarizacion,
  filasExcelMovimientos,
  filtrarMovimientos,
  movimientosDesdeSolicitudes,
  movimientosDesdeTraslados,
  opcionesFiltrosMovimientos,
  rangoPorDefectoCalendarizacion,
  resumenPorTransportista,
  unirMovimientos,
  validarRangoExporte,
} from '@/lib/reporteTraslados';

const ANDES = { id: 'tr-1', nombre: 'Transportes Andes', rut: '76543210-3' };

function vehiculo(chasis: string, extra: Partial<VehiculoAsociado> = {}): VehiculoAsociado {
  return {
    solicitud_vehiculo_id: `sv-${chasis}`,
    disponibilidad: 'reservado' as const,
    chasis,
    patente: null,
    marca: 'Toyota',
    modelo: 'Yaris',
    anio: 2025,
    color: 'Rojo',
    ...extra,
  };
}

function solicitud(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    sucursal: 9,
    sucursal_nombre: 'VALPARAISO',
    sucursal_destino: 6,
    sucursal_destino_nombre: '15 NORTE',
    estado: 'calendarizada',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    logistica_id: 'lg-1',
    logistica_nombre: 'Joaquín Logística',
    creado_por: null,
    creado_por_nombre: null,
    transportista: ANDES,
    fecha_creacion: '2026-10-01T12:00:00Z',
    fecha_tentativa_despacho: '2026-10-21',
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: null,
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: 1,
    vehiculos: [vehiculo('CH001')],
    ...overrides,
  } as SolicitudLista;
}

function traslado(overrides: Partial<TrasladoInterno> = {}): TrasladoInterno {
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    origen_id: 6,
    origen_nombre: '15 NORTE',
    destino_id: 7,
    destino_nombre: 'CONCON',
    logistica_id: 'lg-1',
    logistica_nombre: 'Joaquín Logística',
    estado: 'en_transito',
    fecha_despacho: '2026-10-05T15:00:00Z',
    fecha_recepcion: null,
    observacion: null,
    created_at: '2026-10-05T12:00:00Z',
    updated_at: '2026-10-05T12:00:00Z',
    motivo_cancelacion: null,
    fecha_cancelacion: null,
    recepcion_con_novedades: null,
    observacion_recepcion: null,
    transportista: null,
    vehiculos: [
      {
        traslado_vehiculo_id: 'tv-1',
        disponibilidad: 'reservado',
        id: 'v-9',
        chasis: 'CH900',
        patente: 'ABCD12',
        marca: 'Kia',
        modelo: 'Rio',
        anio: 2024,
        color: null,
        ubicacion: 6,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('diaChile', () => {
  it('should_use_chile_time_when_timestamp_is_after_21_utc_minus_3', () => {
    // 01:30 UTC del 6 de octubre = 22:30 del 5 en Chile (UTC-3).
    expect(diaChile('2026-10-06T01:30:00Z')).toBe('2026-10-05');
  });

  it('should_keep_date_when_value_has_no_time', () => {
    expect(diaChile('2026-10-21')).toBe('2026-10-21');
  });

  it('should_return_null_when_value_is_missing_or_invalid', () => {
    expect(diaChile(null)).toBeNull();
    expect(diaChile('no-fecha')).toBeNull();
  });
});

describe('rangoPorDefectoCalendarizacion', () => {
  it('should_return_tomorrow_to_tomorrow_when_called', () => {
    expect(rangoPorDefectoCalendarizacion('2026-10-31')).toEqual({ desde: '2026-11-01', hasta: '2026-11-01' });
  });
});

describe('validarRangoExporte', () => {
  it('should_accept_range_within_limit', () => {
    expect(validarRangoExporte('2026-10-01', '2026-10-15')).toBeNull();
  });

  it('should_reject_inverted_missing_or_too_long_range', () => {
    expect(validarRangoExporte('2026-10-15', '2026-10-01')).toContain('posterior');
    expect(validarRangoExporte('', '2026-10-01')).toBe('Indica las fechas desde y hasta.');
    expect(validarRangoExporte('2026-01-01', '2026-12-31')).toContain('93 días');
  });
});

describe('filasExcelCalendarizacion', () => {
  it('should_create_one_row_per_vehicle_sorted_by_date_with_carrier', () => {
    const filas = filasExcelCalendarizacion([
      solicitud({ id: 'cccccccc-1', fecha_tentativa_despacho: '2026-10-22', vehiculos: [vehiculo('CH002'), vehiculo('CH003')] }),
      solicitud(),
    ]);

    expect(filas.map((f) => f.Chasis)).toEqual(['CH001', 'CH002', 'CH003']);
    expect(filas[0]).toMatchObject({
      'Fecha programada': '21/10/2026',
      Origen: 'VALPARAISO',
      Destino: '15 NORTE',
      Transportista: 'Transportes Andes',
      'RUT transportista': '76.543.210-3',
      Estado: 'Programada',
      Tipo: 'Sala de venta',
    });
  });

  it('should_keep_request_without_vehicles_or_carrier_as_single_row', () => {
    const filas = filasExcelCalendarizacion([solicitud({ vehiculos: [], transportista: null, tipo_solicitud: 'evento' })]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ Chasis: '', Transportista: '', 'RUT transportista': '', Tipo: 'Evento' });
  });

  it('should_show_request_code_when_request_has_number', () => {
    const [fila] = filasExcelCalendarizacion([solicitud({ sucursal: 101, numero: 15, vehiculos: [] })]);
    expect(fila.Solicitud).toBe('101-15');
  });
});

describe('movimientosDesdeSolicitudes', () => {
  it('should_skip_requests_without_dispatch_and_map_each_vehicle', () => {
    const movs = movimientosDesdeSolicitudes([
      solicitud({ fecha_despacho: null }),
      solicitud({ id: 'dddddddd-1', estado: 'entregada', fecha_despacho: '2026-10-03T14:00:00Z', vehiculos: [vehiculo('A'), vehiculo('B')] }),
    ]);
    expect(movs).toHaveLength(2);
    expect(movs[0]).toMatchObject({ tipo: 'solicitud', codigo: '#DDDDDDDD', fechaDespacho: '2026-10-03', transportistaId: 'tr-1' });
  });

  it('should_use_branch_code_and_number_when_request_has_number', () => {
    const [mov] = movimientosDesdeSolicitudes([
      solicitud({ sucursal: 101, numero: 15, fecha_despacho: '2026-10-03T14:00:00Z', vehiculos: [vehiculo('A')] }),
    ]);
    expect(mov.codigo).toBe('101-15');
  });
});

describe('movimientosDesdeTraslados', () => {
  it('should_map_internal_transfers_without_carrier', () => {
    const movs = movimientosDesdeTraslados([traslado(), traslado({ id: 'eeeeeeee-1', fecha_despacho: null })]);
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'interno', origen: '15 NORTE', destino: 'CONCON', chasis: 'CH900', transportistaId: null });
  });
});

describe('unirMovimientos', () => {
  it('should_keep_only_dispatches_inside_range_sorted_by_date', () => {
    const movs = unirMovimientos(
      [
        solicitud({ id: 'ffffffff-1', fecha_despacho: '2026-10-10T14:00:00Z' }),
        solicitud({ id: 'ffffffff-2', fecha_despacho: '2026-09-30T14:00:00Z' }),
        // 16 de octubre a las 01:00 UTC = 15 de octubre en Chile: entra.
        solicitud({ id: 'ffffffff-3', fecha_despacho: '2026-10-16T01:00:00Z' }),
      ],
      [traslado()],
      '2026-10-01',
      '2026-10-15'
    );
    expect(movs.map((m) => m.fechaDespacho)).toEqual(['2026-10-05', '2026-10-10', '2026-10-15']);
  });
});

describe('filtrarMovimientos', () => {
  const movs = unirMovimientos(
    [solicitud({ fecha_despacho: '2026-10-10T14:00:00Z', vehiculos: [vehiculo('WBA123', { patente: 'XYZ99' })] })],
    [traslado()],
    '2026-10-01',
    '2026-10-31'
  );

  it('should_return_all_when_filters_are_empty', () => {
    expect(filtrarMovimientos(movs, FILTROS_MOVIMIENTOS_VACIOS)).toHaveLength(2);
  });

  it('should_filter_by_carrier_or_missing_carrier', () => {
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, transportista: 'tr-1' }).map((m) => m.tipo)).toEqual(['solicitud']);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, transportista: SIN_TRANSPORTISTA }).map((m) => m.tipo)).toEqual(['interno']);
  });

  it('should_filter_by_origin_destination_type_state_and_vehicle', () => {
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, origen: '15 NORTE' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, destino: '15 NORTE' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, tipo: 'interno' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, estado: 'en_transito' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, vehiculo: 'wba' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, vehiculo: 'xyz9' })).toHaveLength(1);
    expect(filtrarMovimientos(movs, { ...FILTROS_MOVIMIENTOS_VACIOS, vehiculo: 'nada' })).toHaveLength(0);
  });
});

describe('opcionesFiltrosMovimientos', () => {
  it('should_list_unique_sorted_values_from_movements', () => {
    const movs = unirMovimientos([solicitud({ fecha_despacho: '2026-10-10T14:00:00Z' })], [traslado()], '2026-10-01', '2026-10-31');
    const op = opcionesFiltrosMovimientos(movs);
    expect(op.transportistas).toEqual([{ id: 'tr-1', nombre: 'Transportes Andes' }]);
    expect(op.origenes).toEqual(['15 NORTE', 'VALPARAISO']);
    expect(op.estados).toEqual(['calendarizada', 'en_transito']);
  });
});

describe('resumenPorTransportista', () => {
  it('should_count_vehicles_per_carrier_with_missing_ones_grouped', () => {
    const movs = unirMovimientos(
      [solicitud({ fecha_despacho: '2026-10-10T14:00:00Z', vehiculos: [vehiculo('A'), vehiculo('B')] })],
      [traslado()],
      '2026-10-01',
      '2026-10-31'
    );
    expect(resumenPorTransportista(movs)).toEqual([
      { transportista: 'Transportes Andes', rut: '76.543.210-3', vehiculos: 2 },
      { transportista: 'Sin transportista', rut: '', vehiculos: 1 },
    ]);
  });
});

describe('filasExcelMovimientos', () => {
  it('should_use_readable_labels_and_formatted_dates', () => {
    const movs = unirMovimientos([], [traslado({ estado: 'recepcionado', fecha_recepcion: '2026-10-06T15:00:00Z' })], '2026-10-01', '2026-10-31');
    expect(filasExcelMovimientos(movs)[0]).toMatchObject({
      'Fecha despacho': '5/10/2026',
      Tipo: 'Traslado interno',
      Estado: 'Recepcionado',
      Transportista: '',
      'Fecha recepción': '6/10/2026',
    });
  });
});
