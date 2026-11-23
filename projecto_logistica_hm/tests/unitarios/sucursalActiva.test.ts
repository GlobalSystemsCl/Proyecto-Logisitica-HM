import { beforeEach, describe, expect, it, vi } from 'vitest';
import { esSucursalActiva, soloSucursalesActivas, textoBajaSucursal } from '@/lib/sucursalActiva';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('esSucursalActiva', () => {
  it('should_be_active_when_activa_is_true_null_or_missing', () => {
    expect(esSucursalActiva({ activa: true })).toBe(true);
    expect(esSucursalActiva({ activa: null })).toBe(true);
    expect(esSucursalActiva({})).toBe(true);
  });

  it('should_be_inactive_when_activa_is_false', () => {
    expect(esSucursalActiva({ activa: false })).toBe(false);
  });
});

describe('soloSucursalesActivas', () => {
  it('should_drop_deactivated_branches_and_keep_order', () => {
    const lista = [{ id: 3 }, { id: 1, activa: false }, { id: 2, activa: true }];
    expect(soloSucursalesActivas(lista).map((s) => s.id)).toEqual([3, 2]);
  });

  it('should_return_empty_when_list_is_empty', () => {
    expect(soloSucursalesActivas([])).toEqual([]);
  });
});

describe('textoBajaSucursal', () => {
  it('should_offer_definitive_delete_when_branch_has_no_data', () => {
    const t = textoBajaSucursal('NORTE', []);
    expect(t.accion).toBe('eliminar');
    expect(t.boton).toBe('Eliminar definitivamente');
    expect(t.mensaje).toContain('NORTE');
  });

  it('should_say_it_will_be_deactivated_not_deleted_when_branch_has_data', () => {
    const t = textoBajaSucursal('NORTE', ['2 usuario(s) con esta sucursal asignada', '5 vehículo(s) ubicados en ella']);
    expect(t.accion).toBe('desactivar');
    expect(t.titulo).toBe('Desactivar sucursal');
    expect(t.mensaje).toContain('será desactivada y no eliminada');
    expect(t.mensaje).toContain('2 usuario(s) con esta sucursal asignada, 5 vehículo(s) ubicados en ella');
  });
});
