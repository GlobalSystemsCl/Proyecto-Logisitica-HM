import { describe, expect, it } from 'vitest';
import {
  conflictoJefeLocal,
  normalizarAsignaciones,
  sucursalesOcupadasPorJefes,
  validarAsignacionesFormulario,
} from '@/lib/asignaciones';

describe('normalizarAsignaciones', () => {
  it('should_keep_only_the_base_branch_when_role_is_ejecutivo', () => {
    const res = normalizarAsignaciones({ rol: 'ejecutivo', sucursal_id: 6, sucursales_ids: [7, 8], zonas_ids: [1] });

    expect(res).toEqual({ ok: true, asignaciones: { sucursal_id: 6, sucursales_a_cargo: [], zonas_ids: [] } });
  });

  it('should_fail_when_role_needs_a_base_branch_and_has_none', () => {
    for (const rol of ['ejecutivo', 'jefe_local', 'logistica'] as const) {
      const res = normalizarAsignaciones({ rol, sucursal_id: null, zonas_ids: [1] });
      expect(res).toEqual({ ok: false, error: 'Debes asignar la sucursal base del usuario.' });
    }
  });

  it('should_include_base_and_dedupe_additional_branches_when_role_is_jefe_local', () => {
    const res = normalizarAsignaciones({ rol: 'jefe_local', sucursal_id: 6, sucursales_ids: [7, 6, 7, 9] });

    expect(res).toEqual({ ok: true, asignaciones: { sucursal_id: 6, sucursales_a_cargo: [6, 7, 9], zonas_ids: [] } });
  });

  it('should_require_exactly_one_zone_when_role_is_logistica', () => {
    expect(normalizarAsignaciones({ rol: 'logistica', sucursal_id: 6, zonas_ids: [] }).ok).toBe(false);
    expect(normalizarAsignaciones({ rol: 'logistica', sucursal_id: 6, zonas_ids: [1, 2] }).ok).toBe(false);

    const res = normalizarAsignaciones({ rol: 'logistica', sucursal_id: 6, sucursales_ids: [7], zonas_ids: [1] });
    expect(res).toEqual({ ok: true, asignaciones: { sucursal_id: 6, sucursales_a_cargo: [], zonas_ids: [1] } });
  });

  it('should_allow_no_base_branch_when_role_is_administrador_or_operaciones', () => {
    for (const rol of ['administrador', 'operaciones'] as const) {
      const res = normalizarAsignaciones({ rol, sucursal_id: null, sucursales_ids: [7], zonas_ids: [1] });
      expect(res).toEqual({ ok: true, asignaciones: { sucursal_id: null, sucursales_a_cargo: [], zonas_ids: [] } });
    }
  });

  it('should_ignore_invalid_ids', () => {
    const res = normalizarAsignaciones({ rol: 'jefe_local', sucursal_id: 0, sucursales_ids: [5] });
    expect(res.ok).toBe(false);

    const ok = normalizarAsignaciones({ rol: 'jefe_local', sucursal_id: 6, sucursales_ids: [0, -1, 1.5, 8] });
    expect(ok).toEqual({ ok: true, asignaciones: { sucursal_id: 6, sucursales_a_cargo: [6, 8], zonas_ids: [] } });
  });
});

describe('sucursalesOcupadasPorJefes', () => {
  const usuarios = [
    { id: 'jl-1', nombre: 'Ana', rol: 'jefe_local' as const, sucursal_id: 6, sucursales: [{ id: 6 }, { id: 9 }] },
    { id: 'jl-2', nombre: 'Luis', rol: 'jefe_local' as const, sucursal_id: 7, sucursales: [] },
    { id: 'ej-1', nombre: 'Eva', rol: 'ejecutivo' as const, sucursal_id: 8, sucursales: [] },
  ];

  it('should_map_base_and_additional_branches_of_each_jefe_local', () => {
    const ocupadas = sucursalesOcupadasPorJefes(usuarios);

    expect(Object.fromEntries(ocupadas)).toEqual({ 6: 'Ana', 9: 'Ana', 7: 'Luis' });
  });

  it('should_exclude_the_user_being_edited', () => {
    const ocupadas = sucursalesOcupadasPorJefes(usuarios, 'jl-1');

    expect(Object.fromEntries(ocupadas)).toEqual({ 7: 'Luis' });
  });

  it('should_return_empty_map_when_there_are_no_jefes', () => {
    expect(sucursalesOcupadasPorJefes([]).size).toBe(0);
  });
});

describe('conflictoJefeLocal', () => {
  const nombre = (id: number) => `Sucursal ${id}`;

  it('should_return_null_when_no_branch_is_taken', () => {
    expect(conflictoJefeLocal([6, 8], new Map([[7, 'Luis']]), nombre)).toBeNull();
  });

  it('should_list_every_taken_branch_with_its_jefe', () => {
    const msg = conflictoJefeLocal([6, 7, 9], new Map([[7, 'Luis'], [9, 'Ana']]), nombre);

    expect(msg).toBe(
      'Cada sucursal tiene un solo jefe de local. Ya están asignadas: Sucursal 7 (a cargo de Luis), Sucursal 9 (a cargo de Ana).'
    );
  });

  it('should_return_null_when_list_is_empty', () => {
    expect(conflictoJefeLocal([], new Map([[7, 'Luis']]), nombre)).toBeNull();
  });
});

describe('validarAsignacionesFormulario', () => {
  const sucursales = [
    { id: 6, nombre: '15 Norte' },
    { id: 7, nombre: 'Concón' },
  ];

  it('should_return_null_when_assignments_are_valid', () => {
    expect(
      validarAsignacionesFormulario({ rol: 'jefe_local', sucursal_id: 6, sucursales_ids: [] }, new Map(), sucursales)
    ).toBeNull();
  });

  it('should_return_rule_error_before_checking_conflicts', () => {
    expect(validarAsignacionesFormulario({ rol: 'logistica', sucursal_id: 6, zonas_ids: [] }, new Map(), sucursales)).toBe(
      'Un usuario de Logística debe tener exactamente una zona asignada.'
    );
  });

  it('should_name_the_branch_and_its_jefe_when_there_is_a_conflict', () => {
    const msg = validarAsignacionesFormulario(
      { rol: 'jefe_local', sucursal_id: 6, sucursales_ids: [7] },
      new Map([[7, 'Luis Rojas']]),
      sucursales
    );
    expect(msg).toBe('Cada sucursal tiene un solo jefe de local. Ya están asignadas: Concón (a cargo de Luis Rojas).');
  });

  it('should_ignore_conflicts_when_role_is_not_jefe_local', () => {
    expect(
      validarAsignacionesFormulario({ rol: 'ejecutivo', sucursal_id: 7 }, new Map([[7, 'Luis Rojas']]), sucursales)
    ).toBeNull();
  });

  it('should_fallback_to_branch_id_when_name_is_unknown', () => {
    const msg = validarAsignacionesFormulario({ rol: 'jefe_local', sucursal_id: 99 }, new Map([[99, 'Ana']]), []);
    expect(msg).toContain('Sucursal #99 (a cargo de Ana)');
  });
});
