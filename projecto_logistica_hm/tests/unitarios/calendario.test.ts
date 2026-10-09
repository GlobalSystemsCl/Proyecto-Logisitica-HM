import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILTROS_CALENDARIO_INICIALES,
  agruparPorDia,
  cumpleFiltros,
  desplazar,
  esFechaValida,
  estadoPlazo,
  filtrosAParams,
  filtrosDesdeParams,
  hayFiltrosCalendario,
  indicadoresCalendario,
  inicioSemana,
  rangoVista,
  tituloPeriodo,
} from '@/lib/calendario';
import type { SolicitudLista } from '@/types/solicitud.types';

function sol(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'abcd1234-0000',
    sucursal: 1,
    sucursal_nombre: 'Centro',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Norte',
    estado: 'calendarizada',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    logistica_id: 'log-1',
    logistica_nombre: 'Lu',
    fecha_creacion: null,
    fecha_tentativa_despacho: '2026-10-12',
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: '2026-10-20T00:00:00Z',
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: 7,
    vehiculos: [{ solicitud_vehiculo_id: 'sv', disponibilidad: 'reservado', patente: 'ABCD-12', chasis: 'WBA123', marca: 'T', modelo: 'C', anio: 2024, color: null }],
    ...overrides,
  } as SolicitudLista;
}

const ctx = { hoy: '2026-10-09', reprogramaciones: {} as Record<string, number> };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('esFechaValida', () => {
  it('should_accept_real_dates_only', () => {
    expect(esFechaValida('2026-10-09')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('09-10-2026')).toBe(false);
    expect(esFechaValida(undefined)).toBe(false);
  });
});

describe('inicioSemana', () => {
  it('should_return_monday_of_the_week', () => {
    expect(inicioSemana('2026-10-09')).toBe('2026-10-05'); // viernes -> lunes
    expect(inicioSemana('2026-10-05')).toBe('2026-10-05'); // lunes
    expect(inicioSemana('2026-10-11')).toBe('2026-10-05'); // domingo
  });
});

describe('rangoVista', () => {
  it('should_return_a_single_day_for_day_view', () => {
    expect(rangoVista('dia', '2026-10-09')).toEqual({ desde: '2026-10-09', hasta: '2026-10-09', dias: ['2026-10-09'] });
  });

  it('should_return_monday_to_sunday_for_week_view', () => {
    const r = rangoVista('semana', '2026-10-09');
    expect(r.desde).toBe('2026-10-05');
    expect(r.hasta).toBe('2026-10-11');
    expect(r.dias).toHaveLength(7);
  });

  it('should_cover_full_weeks_for_month_view', () => {
    const r = rangoVista('mes', '2026-10-15');
    expect(r.desde).toBe('2026-09-28');
    expect(r.hasta).toBe('2026-11-01');
    expect(r.dias.length % 7).toBe(0);
    expect(r.dias).toContain('2026-10-31');
  });
});

describe('desplazar', () => {
  it('should_move_by_the_view_period', () => {
    expect(desplazar('dia', '2026-10-31', 1)).toBe('2026-11-01');
    expect(desplazar('semana', '2026-10-09', -1)).toBe('2026-10-02');
    expect(desplazar('mes', '2026-01-31', 1)).toBe('2026-02-01');
    expect(desplazar('mes', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('tituloPeriodo', () => {
  it('should_describe_each_view', () => {
    expect(tituloPeriodo('mes', '2026-10-09')).toBe('Octubre 2026');
    expect(tituloPeriodo('dia', '2026-10-09')).toBe('Viernes 9 de octubre de 2026');
    expect(tituloPeriodo('semana', '2026-10-09')).toBe('Semana del 5 al 11 de octubre de 2026');
    expect(tituloPeriodo('semana', '2026-10-30')).toBe('Semana del 26 de octubre al 1 de noviembre de 2026');
  });
});

describe('agruparPorDia', () => {
  it('should_group_by_scheduled_date_and_skip_undated', () => {
    const g = agruparPorDia([sol({ id: 'a' }), sol({ id: 'b', fecha_tentativa_despacho: null }), sol({ id: 'c' })]);
    expect(Object.keys(g)).toEqual(['2026-10-12']);
    expect(g['2026-10-12'].map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('estadoPlazo', () => {
  it('should_mark_late_when_deadline_passed_and_not_received', () => {
    expect(estadoPlazo(sol({ fecha_limite: '2026-10-05' }), '2026-10-09')).toBe('atrasada');
    expect(estadoPlazo(sol({ estado: 'en_transito', fecha_limite: '2026-10-05' }), '2026-10-09')).toBe('atrasada');
  });

  it('should_mark_out_of_deadline_when_scheduled_after_it', () => {
    expect(estadoPlazo(sol({ fecha_tentativa_despacho: '2026-10-25' }), '2026-10-09')).toBe('fuera_de_plazo');
  });

  it('should_be_on_time_when_received_or_without_deadline', () => {
    expect(estadoPlazo(sol({ estado: 'entregada', fecha_limite: '2026-10-01' }), '2026-10-09')).toBe('a_tiempo');
    expect(estadoPlazo(sol({ fecha_limite: null }), '2026-10-09')).toBe('a_tiempo');
    expect(estadoPlazo(sol(), '2026-10-09')).toBe('a_tiempo');
  });
});

describe('filtrosDesdeParams / filtrosAParams', () => {
  it('should_roundtrip_active_filters', () => {
    const f = filtrosDesdeParams({ origen: '1', estado: 'en_transito', q: ' abcd ', reprogramadas: '1', plazo: 'atrasada' });
    expect(f).toMatchObject({ origen: '1', estado: 'en_transito', busqueda: 'abcd', soloReprogramadas: true, plazo: 'atrasada' });
    expect(filtrosAParams(f)).toEqual({ origen: '1', estado: 'en_transito', q: 'abcd', reprogramadas: '1', plazo: 'atrasada' });
  });

  it('should_ignore_invalid_values', () => {
    const f = filtrosDesdeParams({ estado: 'borrada', tipo: 'x', plazo: '<script>', q: ['a'.repeat(60)] });
    expect(f.estado).toBe('');
    expect(f.tipo).toBe('');
    expect(f.plazo).toBe('');
    expect(f.busqueda).toHaveLength(40);
  });

  it('should_report_when_filters_are_active', () => {
    expect(hayFiltrosCalendario(FILTROS_CALENDARIO_INICIALES)).toBe(false);
    expect(hayFiltrosCalendario({ ...FILTROS_CALENDARIO_INICIALES, tipo: 'evento' })).toBe(true);
  });
});

describe('cumpleFiltros', () => {
  const f = FILTROS_CALENDARIO_INICIALES;

  it('should_pass_everything_without_filters', () => {
    expect(cumpleFiltros(sol(), f, ctx)).toBe(true);
  });

  it('should_filter_by_branch_zone_state_type_and_manager', () => {
    expect(cumpleFiltros(sol(), { ...f, origen: '2' }, ctx)).toBe(false);
    expect(cumpleFiltros(sol(), { ...f, destino: '2' }, ctx)).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, zona: '8' }, ctx)).toBe(false);
    expect(cumpleFiltros(sol(), { ...f, estado: 'en_transito' }, ctx)).toBe(false);
    expect(cumpleFiltros(sol(), { ...f, tipo: 'evento' }, ctx)).toBe(false);
    expect(cumpleFiltros(sol(), { ...f, encargado: 'log-1' }, ctx)).toBe(true);
  });

  it('should_search_by_plate_chassis_or_id', () => {
    expect(cumpleFiltros(sol(), { ...f, busqueda: 'abcd-12' }, ctx)).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, busqueda: 'wba' }, ctx)).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, busqueda: 'abcd1234' }, ctx)).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, busqueda: 'zzz' }, ctx)).toBe(false);
  });

  it('should_filter_by_deadline_status_and_rescheduled', () => {
    expect(cumpleFiltros(sol({ fecha_limite: '2026-10-01' }), { ...f, plazo: 'atrasada' }, ctx)).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, plazo: 'atrasada' }, ctx)).toBe(false);
    expect(cumpleFiltros(sol(), { ...f, soloReprogramadas: true }, { ...ctx, reprogramaciones: { 'abcd1234-0000': 2 } })).toBe(true);
    expect(cumpleFiltros(sol(), { ...f, soloReprogramadas: true }, ctx)).toBe(false);
  });
});

describe('indicadoresCalendario', () => {
  it('should_count_period_and_backlog_indicators', () => {
    const programadas = [
      sol({ id: 'a' }),
      sol({ id: 'b', estado: 'en_transito', fecha_limite: '2026-10-01' }),
      sol({ id: 'c', estado: 'entregada' }),
      sol({ id: 'd', fecha_tentativa_despacho: '2026-10-25' }),
    ];
    const porProgramar = [sol({ id: 'e', estado: 'priorizada', fecha_tentativa_despacho: null, fecha_limite: '2026-10-02' })];

    expect(indicadoresCalendario(programadas, porProgramar, { ...ctx, reprogramaciones: { a: 1 } })).toEqual({
      programados: 2,
      enTransito: 1,
      recepcionados: 1,
      atrasados: 2,
      fueraDePlazo: 1,
      sinProgramar: 1,
      reprogramados: 1,
    });
  });
});
