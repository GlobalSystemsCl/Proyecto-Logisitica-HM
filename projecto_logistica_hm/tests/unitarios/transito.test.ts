import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coincideFilaTransito, diasEntre, filasEnTransito, filasExcelTransito } from '@/lib/transito';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';

const EMPRESA = { id: 'e1', nombre: 'Transportes Sur', rut: '76543210-3' };

function solicitud(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    sucursal: 101,
    numero: 15,
    sucursal_nombre: 'VALPARAISO',
    sucursal_destino_nombre: '15 NORTE',
    estado: 'en_transito',
    fecha_despacho: '2026-11-05T15:00:00Z',
    fecha_limite: '2026-11-08',
    titulo_evento: null,
    transportista: EMPRESA,
    patente_camion: 'ABCD12',
    conductor_nombre: 'Pedro',
    vehiculos: [
      { solicitud_vehiculo_id: 'sv-1', disponibilidad: 'reservado', chasis: 'CH001', patente: null, marca: 'Toyota', modelo: 'Yaris', anio: 2025, color: null, numero_guia: 'G-100' },
    ],
    ...overrides,
  } as SolicitudLista;
}

function traslado(overrides: Partial<TrasladoInterno> = {}): TrasladoInterno {
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    origen_nombre: '15 NORTE',
    destino_nombre: 'CONCON',
    estado: 'en_transito',
    fecha_despacho: '2026-11-10T12:00:00Z',
    transportista: null,
    patente_camion: null,
    conductor_nombre: null,
    vehiculos: [
      { traslado_vehiculo_id: 'tv-1', disponibilidad: 'reservado', id: 'v-9', chasis: 'CH900', patente: null, marca: 'Kia', modelo: 'Rio', anio: 2024, color: null, ubicacion: 6 },
    ],
    ...overrides,
  } as TrasladoInterno;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('diasEntre', () => {
  it('should_count_whole_days_and_never_be_negative', () => {
    expect(diasEntre('2026-11-05', '2026-11-11')).toBe(6);
    expect(diasEntre('2026-11-11', '2026-11-05')).toBe(0);
  });

  it('should_return_null_when_a_date_is_missing', () => {
    expect(diasEntre(null, '2026-11-11')).toBeNull();
  });
});

describe('filasEnTransito', () => {
  it('should_build_one_row_per_vehicle_sorted_by_days_on_the_way', () => {
    const filas = filasEnTransito([solicitud()], [traslado()], '2026-11-11');
    expect(filas.map((f) => [f.chasis, f.dias])).toEqual([
      ['CH001', 6],
      ['CH900', 1],
    ]);
    expect(filas[0]).toMatchObject({
      tipo: 'solicitud',
      codigo: '101-15',
      guia: 'G-100',
      patenteCamion: 'ABCD12',
      transportista: 'Pedro',
      empresa: 'Transportes Sur',
      atrasado: true,
    });
    expect(filas[1]).toMatchObject({ tipo: 'interno', atrasado: false, guia: null });
  });

  it('should_skip_requests_and_transfers_not_in_transit', () => {
    expect(filasEnTransito([solicitud({ estado: 'entregada' })], [traslado({ estado: 'recepcionado' })], '2026-11-11')).toEqual([]);
  });

  it('should_not_be_late_before_the_deadline', () => {
    expect(filasEnTransito([solicitud({ fecha_limite: '2026-11-20' })], [], '2026-11-11')[0].atrasado).toBe(false);
  });
});

describe('coincideFilaTransito', () => {
  const [fila] = filasEnTransito([solicitud()], [], '2026-11-11');

  it('should_match_by_chassis_guide_code_plate_or_rut', () => {
    for (const q of ['ch001', 'g-100', '101-15', 'abcd-12', '76.543.210', '']) {
      expect(coincideFilaTransito(fila, q), q).toBe(true);
    }
  });

  it('should_not_match_unrelated_text', () => {
    expect(coincideFilaTransito(fila, 'ZZZZ99')).toBe(false);
  });
});

describe('filasExcelTransito', () => {
  it('should_use_readable_labels_and_formatted_values', () => {
    const [f] = filasExcelTransito(filasEnTransito([solicitud()], [], '2026-11-11'));
    expect(f).toMatchObject({
      Tipo: 'Solicitud',
      'N° guía': 'G-100',
      'Patente camión': 'ABCD-12',
      'RUT empresa': '76.543.210-3',
      'Días en camino': '6',
      Atrasado: 'Sí',
    });
  });
});
