import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buscarCamion,
  coincideEmpresa,
  coincideTransporte,
  empresasParaProgramar,
  errorAsignacionTransporte,
  filtrarEmpresas,
  textoTransporte,
} from '@/lib/transporte';
import type { EmpresaTransporte } from '@/types/transportista.types';

function empresa(overrides: Partial<EmpresaTransporte> = {}): EmpresaTransporte {
  return {
    id: 'e-1',
    nombre: 'Transportes Sur',
    rut: '76543210-3',
    activo: true,
    camiones: [{ id: 'c-1', patente: 'ABCD12', transportista_id: 'e-1', conductor_nombre: 'Pedro Soto', activo: true }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('coincideEmpresa', () => {
  it('should_match_everything_when_search_is_empty', () => {
    expect(coincideEmpresa(empresa(), '  ')).toBe(true);
  });

  it('should_match_by_company_name_rut_plate_or_driver', () => {
    expect(coincideEmpresa(empresa(), 'sur')).toBe(true);
    expect(coincideEmpresa(empresa(), '76.543.210-3')).toBe(true);
    expect(coincideEmpresa(empresa(), 'abcd-12')).toBe(true);
    expect(coincideEmpresa(empresa(), 'pedro')).toBe(true);
  });

  it('should_not_match_unrelated_text', () => {
    expect(coincideEmpresa(empresa(), 'norte')).toBe(false);
    expect(coincideEmpresa(empresa(), 'ZZZZ99')).toBe(false);
  });
});

describe('filtrarEmpresas', () => {
  it('should_hide_inactive_companies_only_when_requested', () => {
    const lista = [empresa(), empresa({ id: 'e-2', nombre: 'Transportes Norte', activo: false, camiones: [] })];
    expect(filtrarEmpresas(lista, 'transportes').map((e) => e.id)).toEqual(['e-1', 'e-2']);
    expect(filtrarEmpresas(lista, 'transportes', true).map((e) => e.id)).toEqual(['e-1']);
  });
});

describe('empresasParaProgramar', () => {
  it('should_keep_active_companies_with_only_active_trucks', () => {
    const lista = [
      empresa({
        camiones: [
          { id: 'c-1', patente: 'ABCD12', transportista_id: 'e-1', conductor_nombre: null, activo: true },
          { id: 'c-2', patente: 'WXYZ99', transportista_id: 'e-1', conductor_nombre: null, activo: false },
        ],
      }),
      empresa({ id: 'e-2', activo: false }),
    ];
    const res = empresasParaProgramar(lista);
    expect(res.map((e) => e.id)).toEqual(['e-1']);
    expect(res[0].camiones.map((c) => c.id)).toEqual(['c-1']);
  });
});

describe('buscarCamion', () => {
  it('should_find_truck_and_company_by_plate_with_or_without_dash', () => {
    expect(buscarCamion([empresa()], 'abcd-12')?.camion.id).toBe('c-1');
    expect(buscarCamion([empresa()], 'abcd-12')?.empresa.id).toBe('e-1');
  });

  it('should_return_null_when_plate_is_unknown_or_empty', () => {
    expect(buscarCamion([empresa()], 'ZZZZ99')).toBeNull();
    expect(buscarCamion([empresa()], '')).toBeNull();
  });
});

describe('textoTransporte', () => {
  const transportista = { id: 'e-1', nombre: 'Transportes Sur', rut: '76543210-3' };

  it('should_join_plate_driver_and_company_with_rut', () => {
    expect(textoTransporte({ transportista, patente_camion: 'ABCD12', conductor_nombre: 'Pedro' })).toBe(
      'ABCD-12 · Pedro · Transportes Sur (76.543.210-3)'
    );
  });

  it('should_show_only_company_for_old_trips_and_empty_without_data', () => {
    expect(textoTransporte({ transportista })).toBe('Transportes Sur (76.543.210-3)');
    expect(textoTransporte({ transportista: null })).toBe('');
  });
});

describe('coincideTransporte', () => {
  const d = { transportista: { id: 'e-1', nombre: 'Sur', rut: '76543210-3' }, patente_camion: 'ABCD12' };

  it('should_match_by_plate_or_company_rut', () => {
    expect(coincideTransporte(d, 'abcd-12')).toBe(true);
    expect(coincideTransporte(d, '76.543')).toBe(true);
    expect(coincideTransporte(d, '')).toBe(true);
  });

  it('should_not_match_other_plates_or_ruts', () => {
    expect(coincideTransporte(d, 'ZZZZ99')).toBe(false);
    expect(coincideTransporte(d, '11.111.111-1')).toBe(false);
  });
});

describe('errorAsignacionTransporte', () => {
  it('should_require_registered_plate_and_driver', () => {
    expect(errorAsignacionTransporte([empresa()], null)).toBe('Indica la patente del camión.');
    expect(errorAsignacionTransporte([empresa()], { patente: 'ZZZZ99', conductorNombre: 'Ana' })).toContain('no está registrada');
    expect(errorAsignacionTransporte([empresa()], { patente: 'ABCD-12', conductorNombre: ' ' })).toBe(
      'Indica el nombre del transportista que maneja el camión.'
    );
  });

  it('should_return_null_when_assignment_is_complete', () => {
    expect(errorAsignacionTransporte([empresa()], { patente: 'abcd12', conductorNombre: 'Pedro' })).toBeNull();
  });
});
