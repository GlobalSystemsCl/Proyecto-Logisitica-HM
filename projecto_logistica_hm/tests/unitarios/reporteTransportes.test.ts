import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovimientoTraslado } from '@/lib/reporteTraslados';
import {
  filasExcelResumen,
  horasEntre,
  resumenPorCamion,
  resumenPorEmpresa,
  resumenPorTramo,
  textoATiempo,
} from '@/lib/reporteTransportes';

const HOY = '2026-11-12';

function mov(overrides: Partial<MovimientoTraslado> = {}): MovimientoTraslado {
  return {
    clave: 'k',
    tipo: 'solicitud',
    codigo: '101-1',
    fechaDespacho: '2026-11-05',
    fechaRecepcion: '2026-11-06',
    despachoISO: '2026-11-05T12:00:00Z',
    recepcionISO: '2026-11-06T12:00:00Z',
    fechaLimite: '2026-11-07',
    origen: 'VALPARAISO',
    destino: '15 NORTE',
    chasis: 'CH1',
    patente: null,
    marca: 'Kia',
    modelo: 'Rio',
    numeroGuia: 'G1',
    transportistaId: 'e1',
    transportistaNombre: 'Transportes Sur',
    transportistaRut: '76543210-3',
    patenteCamion: 'ABCD12',
    conductor: 'Pedro',
    logistica: null,
    estado: 'entregada',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('horasEntre', () => {
  it('should_measure_hours_between_two_timestamps', () => {
    expect(horasEntre('2026-11-05T12:00:00Z', '2026-11-06T18:00:00Z')).toBe(30);
  });

  it('should_return_null_when_missing_or_reversed', () => {
    expect(horasEntre(null, '2026-11-06T18:00:00Z')).toBeNull();
    expect(horasEntre('2026-11-06T18:00:00Z', '2026-11-05T12:00:00Z')).toBeNull();
  });
});

describe('resumenPorEmpresa', () => {
  it('should_count_trips_vehicles_times_and_on_time_deliveries', () => {
    const movs = [
      mov({ clave: 'a', codigo: '101-1', chasis: 'CH1' }),
      mov({ clave: 'b', codigo: '101-1', chasis: 'CH2', recepcionISO: '2026-11-07T12:00:00Z', fechaRecepcion: '2026-11-07' }),
      mov({ clave: 'c', codigo: '101-2', chasis: 'CH3', fechaRecepcion: '2026-11-09', recepcionISO: '2026-11-09T12:00:00Z' }),
    ];
    const [r] = resumenPorEmpresa(movs, HOY);
    expect(r).toMatchObject({ nombre: 'Transportes Sur', detalle: '76.543.210-3', viajes: 2, vehiculos: 3, recibidos: 3 });
    expect(r.horasPromedio).toBe(56); // (24 h + 48 h + 96 h) / 3
    expect(r.horasMediana).toBe(48);
    expect(r.conPlazo).toBe(3);
    expect(r.aTiempo).toBe(2);
    expect(textoATiempo(r)).toBe('67 %');
  });

  it('should_flag_late_vehicles_still_on_the_way_and_skip_cancelled', () => {
    const movs = [
      mov({ clave: 'a', fechaRecepcion: null, recepcionISO: null, fechaLimite: '2026-11-10', estado: 'en_transito' }),
      mov({ clave: 'b', estado: 'cancelada' }),
    ];
    const [r] = resumenPorEmpresa(movs, HOY);
    expect(r.vehiculos).toBe(1);
    expect(r.atrasadosEnCamino).toBe(1);
    expect(r.horasPromedio).toBeNull();
    expect(textoATiempo(r)).toBe('—');
  });

  it('should_group_movements_without_company_together', () => {
    const r = resumenPorEmpresa([mov({ transportistaId: null, transportistaNombre: null, transportistaRut: null })], HOY);
    expect(r[0]).toMatchObject({ nombre: 'Sin empresa registrada', detalle: '' });
  });
});

describe('resumenPorCamion', () => {
  it('should_group_by_plate_with_driver_and_company', () => {
    const r = resumenPorCamion([mov(), mov({ clave: 'b', patenteCamion: null })], HOY);
    expect(r.map((x) => [x.nombre, x.detalle])).toEqual([
      ['ABCD-12', 'Pedro · Transportes Sur'],
      ['Sin camión registrado', 'Pedro · Transportes Sur'],
    ]);
  });
});

describe('resumenPorTramo', () => {
  it('should_group_by_origin_and_destination_sorted_by_vehicles', () => {
    const r = resumenPorTramo([mov(), mov({ clave: 'b' }), mov({ clave: 'c', destino: 'CONCON' })], HOY);
    expect(r.map((x) => [x.nombre, x.vehiculos])).toEqual([
      ['VALPARAISO → 15 NORTE', 2],
      ['VALPARAISO → CONCON', 1],
    ]);
  });
});

describe('filasExcelResumen', () => {
  it('should_name_columns_and_format_times', () => {
    const [fila] = filasExcelResumen(resumenPorEmpresa([mov()], HOY), 'Empresa', 'RUT');
    expect(fila).toMatchObject({
      Empresa: 'Transportes Sur',
      RUT: '76.543.210-3',
      Viajes: 1,
      'Tiempo promedio de llegada': '1 d',
      'A tiempo': '100 %',
    });
  });
});
