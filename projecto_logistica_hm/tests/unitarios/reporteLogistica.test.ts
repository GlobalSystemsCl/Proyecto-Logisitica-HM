import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIN_ASIGNAR,
  calcularReporte,
  formatoHoras,
  indicadoresDeEncargado,
  mediana,
  porcentaje,
  primeraCalendarizacion,
  promedio,
  semaforo,
  type EventoAuditoria,
} from '@/lib/reporteLogistica';
import type { SolicitudLista } from '@/types/solicitud.types';

function sol(overrides: Partial<SolicitudLista>): SolicitudLista {
  return {
    id: 's',
    sucursal: 1,
    sucursal_nombre: 'Centro',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Norte',
    estado: 'aprobada',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    logistica_id: null,
    logistica_nombre: null,
    fecha_creacion: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: '2026-10-30T00:00:00Z',
    fecha_confirmacion: '2026-10-08T12:00:00Z',
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: 7,
    vehiculos: [],
    ...overrides,
  } as SolicitudLista;
}

const ev = (entidad_id: string, usuario_id: string, accion: string, created_at: string): EventoAuditoria => ({
  entidad_id,
  usuario_id,
  accion,
  created_at,
});

const usuarios = [
  { id: 'ana', nombre: 'Ana Logística' },
  { id: 'beto', nombre: 'Beto Logística' },
];

const OPC = { desde: '2026-10-01', hasta: '2026-10-31', ahora: '2026-10-09T12:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('helpers estadísticos', () => {
  it('should_compute_mean_and_median', () => {
    expect(promedio([2, 4, 9])).toBe(5);
    expect(mediana([9, 2, 4])).toBe(4);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
    expect(promedio([])).toBeNull();
    expect(mediana([])).toBeNull();
  });

  it('should_map_hours_to_traffic_light_against_sla', () => {
    expect(semaforo(10, 24)).toBe('verde');
    expect(semaforo(24, 24)).toBe('verde');
    expect(semaforo(40, 24)).toBe('amarillo');
    expect(semaforo(49, 24)).toBe('rojo');
    expect(semaforo(null, 24)).toBe('sin_datos');
  });

  it('should_format_hours_and_percentages', () => {
    expect(formatoHoras(5.4)).toBe('5 h');
    expect(formatoHoras(52)).toBe('2 d 4 h');
    expect(formatoHoras(48)).toBe('2 d');
    expect(formatoHoras(null)).toBe('—');
    expect(porcentaje(3, 4)).toBe('75%');
    expect(porcentaje(0, 0)).toBe('—');
  });
});

describe('primeraCalendarizacion', () => {
  it('should_keep_the_earliest_calendarization_per_solicitud', () => {
    const m = primeraCalendarizacion([
      ev('s1', 'beto', 'calendarizacion', '2026-10-05T10:00:00Z'),
      ev('s1', 'ana', 'calendarizacion', '2026-10-03T10:00:00Z'),
      ev('s1', 'ana', 'recalendarizacion', '2026-10-01T10:00:00Z'),
    ]);
    expect(m.get('s1')?.usuario_id).toBe('ana');
    expect(m.size).toBe(1);
  });
});

describe('calcularReporte', () => {
  it('should_measure_response_time_from_approval_to_first_calendarization', () => {
    const r = calcularReporte(
      [
        sol({ id: 's1', estado: 'calendarizada', logistica_id: 'ana', fecha_confirmacion: '2026-10-02T08:00:00Z' }),
        sol({ id: 's2', estado: 'calendarizada', logistica_id: 'ana', fecha_confirmacion: '2026-10-02T08:00:00Z' }),
      ],
      [
        ev('s1', 'ana', 'calendarizacion', '2026-10-02T14:00:00Z'), // 6 h
        ev('s2', 'ana', 'calendarizacion', '2026-10-04T08:00:00Z'), // 48 h
      ],
      usuarios,
      OPC
    );
    const ana = r.porEncargado.find((f) => f.id === 'ana')!;
    expect(ana.respondidas).toBe(2);
    expect(ana.respuestaPromedioHoras).toBe(27);
    expect(ana.respuestaMedianaHoras).toBe(27);
    expect(ana.respuestasDentroDeSla).toBe(1);
    expect(ana.enCurso).toBe(2);
    expect(r.totales.respuestaPromedioHoras).toBe(27);
  });

  it('should_count_pending_age_and_out_of_sla_including_unassigned', () => {
    const r = calcularReporte(
      [
        sol({ id: 'p1', estado: 'asignada', logistica_id: 'beto', fecha_confirmacion: '2026-10-07T12:00:00Z' }), // 48 h
        sol({ id: 'p2', estado: 'aprobada', logistica_id: null, fecha_confirmacion: '2026-10-09T06:00:00Z' }), // 6 h
      ],
      [],
      usuarios,
      OPC
    );
    const beto = r.porEncargado.find((f) => f.id === 'beto')!;
    expect(beto.pendientes).toBe(1);
    expect(beto.pendientesFueraDeSla).toBe(1);
    expect(beto.antiguedadMaximaHoras).toBe(48);
    expect(beto.semaforo).toBe('amarillo');

    const sinAsignar = r.porEncargado.find((f) => f.id === SIN_ASIGNAR)!;
    expect(sinAsignar.pendientes).toBe(1);
    expect(sinAsignar.pendientesFueraDeSla).toBe(0);

    expect(r.pendientesMasAntiguos.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(r.totales.pendientes).toBe(2);
  });

  it('should_flag_late_solicitudes_and_on_time_receptions', () => {
    const r = calcularReporte(
      [
        sol({ id: 'late', estado: 'en_transito', logistica_id: 'ana', fecha_limite: '2026-10-05T00:00:00Z' }),
        sol({ id: 'ok', estado: 'entregada', logistica_id: 'ana', fecha_limite: '2026-10-10', fecha_recepcion: '2026-10-08T10:00:00Z' }),
        sol({ id: 'tarde', estado: 'entregada', logistica_id: 'ana', fecha_limite: '2026-10-03', fecha_recepcion: '2026-10-06T10:00:00Z' }),
      ],
      [],
      usuarios,
      OPC
    );
    const ana = r.porEncargado.find((f) => f.id === 'ana')!;
    expect(ana.atrasadas).toBe(1);
    expect(ana.recibidas).toBe(2);
    expect(ana.recibidasATiempo).toBe(1);
  });

  it('should_count_reschedulings_and_cancellations_by_author_within_period', () => {
    const r = calcularReporte(
      [],
      [
        ev('s1', 'beto', 'recalendarizacion', '2026-10-05T10:00:00Z'),
        ev('s1', 'beto', 'recalendarizacion', '2026-09-20T10:00:00Z'), // fuera del período
        ev('s2', 'ana', 'cancelacion_transito', '2026-10-06T10:00:00Z'),
      ],
      usuarios,
      OPC
    );
    expect(r.porEncargado.find((f) => f.id === 'beto')!.reprogramaciones).toBe(1);
    expect(r.porEncargado.find((f) => f.id === 'ana')!.cancelaciones).toBe(1);
  });

  it('should_ignore_calendarizations_outside_the_period', () => {
    const r = calcularReporte(
      [sol({ id: 's1', estado: 'calendarizada', logistica_id: 'ana', fecha_confirmacion: '2026-09-01T00:00:00Z' })],
      [ev('s1', 'ana', 'calendarizacion', '2026-09-02T00:00:00Z')],
      usuarios,
      OPC
    );
    expect(r.porEncargado.find((f) => f.id === 'ana')!.respondidas).toBe(0);
  });

  it('should_list_every_logistics_user_even_without_activity_and_hide_empty_unassigned', () => {
    const r = calcularReporte([], [], usuarios, OPC);
    expect(r.porEncargado.map((f) => f.id).sort()).toEqual(['ana', 'beto']);
    expect(r.totales.semaforo).toBe('sin_datos');
  });

  it('should_sort_by_out_of_sla_pending_first', () => {
    const r = calcularReporte(
      [
        sol({ id: 'a', estado: 'asignada', logistica_id: 'ana', fecha_confirmacion: '2026-10-09T10:00:00Z' }),
        sol({ id: 'b', estado: 'asignada', logistica_id: 'beto', fecha_confirmacion: '2026-10-01T10:00:00Z' }),
      ],
      [],
      usuarios,
      OPC
    );
    expect(r.porEncargado[0].id).toBe('beto');
    expect(r.porEncargado[0].semaforo).toBe('rojo');
  });
});

describe('indicadoresDeEncargado', () => {
  it('should_return_own_row_and_unassigned_pending', () => {
    const r = calcularReporte(
      [
        sol({ id: 'a', estado: 'asignada', logistica_id: 'ana', fecha_confirmacion: '2026-10-08T12:00:00Z' }),
        sol({ id: 'b', estado: 'aprobada', logistica_id: null, fecha_confirmacion: '2026-10-09T10:00:00Z' }),
      ],
      [],
      [usuarios[0]],
      OPC
    );
    const { propia, sinAsignar } = indicadoresDeEncargado(r, 'ana');
    expect(propia.pendientes).toBe(1);
    expect(propia.antiguedadMaximaHoras).toBe(24);
    expect(sinAsignar?.pendientes).toBe(1);
  });

  it('should_return_empty_row_and_null_unassigned_when_there_is_no_activity', () => {
    const r = calcularReporte([], [], [], OPC);
    const { propia, sinAsignar } = indicadoresDeEncargado(r, 'ana');
    expect(propia.pendientes).toBe(0);
    expect(propia.semaforo).toBe('sin_datos');
    expect(sinAsignar).toBeNull();
  });
});
