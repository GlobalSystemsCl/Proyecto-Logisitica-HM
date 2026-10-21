import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contarUsuarios, cumpleEstado, esPendiente, estadoDesdeParam } from '@/lib/usuariosAdmin';

const PENDIENTE = { activo: false, aprobado: false };
const ACTIVO = { activo: true, aprobado: true };
const INACTIVO = { activo: false, aprobado: true };
const SIN_APROBADO = { activo: true, aprobado: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('esPendiente', () => {
  it('should_be_true_only_when_aprobado_is_false', () => {
    expect(esPendiente(PENDIENTE)).toBe(true);
    expect(esPendiente(SIN_APROBADO)).toBe(false);
    expect(esPendiente(ACTIVO)).toBe(false);
  });
});

describe('cumpleEstado', () => {
  it('should_classify_each_account_in_exactly_one_state', () => {
    expect(cumpleEstado(PENDIENTE, 'pendientes')).toBe(true);
    expect(cumpleEstado(PENDIENTE, 'inactivos')).toBe(false);
    expect(cumpleEstado(ACTIVO, 'activos')).toBe(true);
    expect(cumpleEstado(INACTIVO, 'inactivos')).toBe(true);
    expect(cumpleEstado(SIN_APROBADO, 'activos')).toBe(true);
  });

  it('should_accept_everything_when_state_is_todos', () => {
    expect([PENDIENTE, ACTIVO, INACTIVO].every((u) => cumpleEstado(u, 'todos'))).toBe(true);
  });
});

describe('contarUsuarios', () => {
  it('should_count_inactive_pending_accounts_as_pending', () => {
    expect(contarUsuarios([PENDIENTE, PENDIENTE, ACTIVO, INACTIVO])).toEqual({
      total: 4,
      activos: 1,
      pendientes: 2,
      inactivos: 1,
    });
  });

  it('should_return_zeros_when_there_are_no_users', () => {
    expect(contarUsuarios([])).toEqual({ total: 0, activos: 0, pendientes: 0, inactivos: 0 });
  });
});

describe('estadoDesdeParam', () => {
  it('should_return_known_state', () => {
    expect(estadoDesdeParam('pendientes')).toBe('pendientes');
  });

  it('should_default_to_todos_when_value_is_unknown_or_missing', () => {
    expect(estadoDesdeParam('x')).toBe('todos');
    expect(estadoDesdeParam(null)).toBe('todos');
  });
});
