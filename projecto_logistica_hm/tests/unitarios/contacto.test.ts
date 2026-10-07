import { describe, expect, it } from 'vitest';
import { ocultarContacto, puedeVerContacto } from '@/lib/auth/contacto';
import type { UserProfile, UsuarioDetalle } from '@/types/auth.types';

function viewer(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'v-1',
    email: 'v@test.com',
    nombre: 'Ver',
    apellido: 'Dor',
    rol: 'ejecutivo',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function target(overrides: Partial<UsuarioDetalle> = {}): UsuarioDetalle {
  return {
    id: 't-1',
    email: 't@test.com',
    nombre: 'Tar',
    apellido: 'Get',
    rol: 'ejecutivo',
    activo: true,
    telefono: '+56 9 1111 1111',
    sucursal_id: 2,
    sucursal_nombre: 'Sucursal 2',
    sucursales: [],
    zonas: [],
    created_at: '',
    ...overrides,
  };
}

describe('puedeVerContacto', () => {
  it('should_allow_when_viewer_is_admin', () => {
    expect(puedeVerContacto(viewer({ rol: 'administrador' }), target(), false)).toBe(true);
  });

  it('should_allow_when_viewer_is_the_same_user', () => {
    expect(puedeVerContacto(viewer({ id: 't-1' }), target(), false)).toBe(true);
  });

  it('should_allow_when_target_participates_in_visible_solicitud', () => {
    expect(puedeVerContacto(viewer(), target(), true)).toBe(true);
  });

  it('should_allow_when_target_has_coordination_role', () => {
    expect(puedeVerContacto(viewer(), target({ rol: 'jefe_local' }), false)).toBe(true);
    expect(puedeVerContacto(viewer(), target({ rol: 'logistica' }), false)).toBe(true);
  });

  it('should_allow_when_users_share_a_sucursal', () => {
    expect(puedeVerContacto(viewer({ sucursal_id: 2 }), target(), false)).toBe(true);
    expect(
      puedeVerContacto(viewer({ sucursal_id: null, sucursales: [{ id: 2, nombre: 'S2' }] }), target(), false)
    ).toBe(true);
    expect(
      puedeVerContacto(viewer(), target({ sucursal_id: null, sucursales: [{ id: 1, nombre: 'S1' }] }), false)
    ).toBe(true);
  });

  it('should_allow_when_users_share_a_zona', () => {
    const v = viewer({ rol: 'logistica', sucursal_id: null, zonas: [{ id: 7, nombre: 'Norte' }] });
    expect(puedeVerContacto(v, target({ zonas: [{ id: 7, nombre: 'Norte' }] }), false)).toBe(true);
  });

  it('should_deny_when_ejecutivo_of_other_sucursal_without_relation', () => {
    expect(puedeVerContacto(viewer(), target(), false)).toBe(false);
  });

  it('should_deny_when_viewer_has_no_sucursal_nor_zona', () => {
    expect(puedeVerContacto(viewer({ sucursal_id: null }), target(), false)).toBe(false);
  });
});

describe('ocultarContacto', () => {
  it('should_remove_email_and_phone_and_flag_detail', () => {
    const res = ocultarContacto(target());
    expect(res.email).toBe('');
    expect(res.telefono).toBeNull();
    expect(res.contacto_oculto).toBe(true);
    expect(res.nombre).toBe('Tar');
    expect(res.rol).toBe('ejecutivo');
  });
});
