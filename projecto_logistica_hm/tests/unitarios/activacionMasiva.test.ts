import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ACTIVACION_MASIVA,
  asignacionParaUsuario,
  idsUnicos,
  validarAsignacionMasiva,
} from '@/lib/activacionMasiva';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validarAsignacionMasiva', () => {
  it('should_accept_ejecutivo_keeping_registration_branch', () => {
    expect(validarAsignacionMasiva({ rol: 'ejecutivo', sucursal: 'registro' }, 3)).toBeNull();
  });

  it('should_accept_logistica_with_branch_and_zone', () => {
    expect(validarAsignacionMasiva({ rol: 'logistica', sucursal: 4, zonaId: 2 }, 1)).toBeNull();
  });

  it('should_reject_when_nothing_is_selected', () => {
    expect(validarAsignacionMasiva({ rol: 'ejecutivo', sucursal: 'registro' }, 0)).toBe('Selecciona al menos una cuenta.');
  });

  it('should_reject_when_selection_exceeds_limit', () => {
    expect(validarAsignacionMasiva({ rol: 'ejecutivo', sucursal: 'registro' }, MAX_ACTIVACION_MASIVA + 1)).toMatch(/hasta 100/);
  });

  it('should_reject_jefe_local_and_administrador', () => {
    expect(validarAsignacionMasiva({ rol: 'jefe_local', sucursal: 1 }, 1)).toMatch(/solo admite/);
    expect(validarAsignacionMasiva({ rol: 'administrador', sucursal: 'registro' }, 1)).toMatch(/solo admite/);
  });

  it('should_reject_invalid_branch_id', () => {
    expect(validarAsignacionMasiva({ rol: 'ejecutivo', sucursal: 0 }, 1)).toBe('La sucursal elegida no es válida.');
    expect(validarAsignacionMasiva({ rol: 'ejecutivo', sucursal: 1.5 }, 1)).toBe('La sucursal elegida no es válida.');
  });

  it('should_reject_logistica_without_zone', () => {
    expect(validarAsignacionMasiva({ rol: 'logistica', sucursal: 'registro', zonaId: null }, 1)).toBe('Elige la zona de Logística.');
  });
});

describe('asignacionParaUsuario', () => {
  it('should_use_registration_branch_when_mode_is_registro', () => {
    expect(asignacionParaUsuario({ rol: 'ejecutivo', sucursal: 'registro' }, 7)).toEqual({
      rol: 'ejecutivo',
      sucursal_id: 7,
      sucursales_ids: [],
      zonas_ids: [],
    });
  });

  it('should_use_null_when_user_did_not_declare_a_branch', () => {
    expect(asignacionParaUsuario({ rol: 'operaciones', sucursal: 'registro' }, undefined).sucursal_id).toBeNull();
  });

  it('should_use_common_branch_and_zone_for_logistica', () => {
    expect(asignacionParaUsuario({ rol: 'logistica', sucursal: 3, zonaId: 2 }, 7)).toEqual({
      rol: 'logistica',
      sucursal_id: 3,
      sucursales_ids: [],
      zonas_ids: [2],
    });
  });

  it('should_ignore_zone_for_roles_other_than_logistica', () => {
    expect(asignacionParaUsuario({ rol: 'ejecutivo', sucursal: 3, zonaId: 2 }, 7).zonas_ids).toEqual([]);
  });
});

describe('idsUnicos', () => {
  it('should_remove_duplicates_and_blanks_keeping_order', () => {
    expect(idsUnicos(['b', 'a', 'b', ' ', ''])).toEqual(['b', 'a']);
  });
});
