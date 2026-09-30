import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

const { OrganizacionService } = await import('@/services/organizacion.service');

describe('OrganizacionService.getUserAssignedBranches', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {});

  it('should_return_principal_and_managed_branches_deduplicated', async () => {
    admin.results.usuario = [
      fila({ sucursal_id: 1, sucursal: { id: 1, nombre: 'Casa Matriz' } }),
    ];
    admin.results.sucursal = [
      fila([
        { id: 1, nombre: 'Casa Matriz' },
        { id: 2, nombre: 'Norte' },
        { id: 3, nombre: 'Sur' },
      ]),
    ];

    const res = await OrganizacionService.getUserAssignedBranches('u-1');

    expect(res).toEqual([
      { id: 1, nombre: 'Casa Matriz' },
      { id: 2, nombre: 'Norte' },
      { id: 3, nombre: 'Sur' },
    ]);
  });

  it('should_return_only_managed_branches_when_no_principal', async () => {
    admin.results.usuario = [fila({ sucursal_id: null, sucursal: null })];
    admin.results.sucursal = [fila([{ id: 2, nombre: 'Norte' }])];

    const res = await OrganizacionService.getUserAssignedBranches('u-1');

    expect(res).toEqual([{ id: 2, nombre: 'Norte' }]);
  });

  it('should_return_empty_when_no_branches_assigned', async () => {
    admin.results.usuario = [fila({ sucursal_id: null, sucursal: null })];
    admin.results.sucursal = [fila([])];

    const res = await OrganizacionService.getUserAssignedBranches('u-1');

    expect(res).toEqual([]);
  });

  it('should_return_empty_when_union_has_two_entries', async () => {
    const res = await OrganizacionService.getUserAssignedBranches('');

    expect(res).toEqual([]);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('should_return_empty_when_query_fails', async () => {
    admin.results.usuario = [{ data: null, error: { message: 'boom' } }];
    admin.results.sucursal = [fila([])];

    const res = await OrganizacionService.getUserAssignedBranches('u-1');

    expect(res).toEqual([]);
  });
});

/**
 * Es el candado de permisos multi-sucursal del Jefe Local: decide si puede
 * recibir/finalizar en una sucursal que NO es su principal (la preside como
 * encargado). Delega en el RPC `usuario_tiene_sucursal` y, si el RPC falla,
 * replica la consulta con principal + sucursales a cargo.
 */
describe('OrganizacionService.usuarioTieneSucursal', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_return_true_when_rpc_confirms_the_branch', async () => {
    admin.rpc.mockResolvedValueOnce({ data: true, error: null });

    const res = await OrganizacionService.usuarioTieneSucursal('u-1', 2);

    expect(res).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith('usuario_tiene_sucursal', {
      p_usuario_id: 'u-1',
      p_sucursal_id: 2,
    });
  });

  it('should_return_false_when_rpc_denies_the_branch', async () => {
    admin.rpc.mockResolvedValueOnce({ data: false, error: null });

    const res = await OrganizacionService.usuarioTieneSucursal('u-1', 2);

    expect(res).toBe(false);
  });

  it('should_return_false_when_ids_are_missing', async () => {
    expect(await OrganizacionService.usuarioTieneSucursal('', 2)).toBe(false);
    expect(await OrganizacionService.usuarioTieneSucursal('u-1', 0)).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('should_fallback_to_assigned_branches_when_rpc_fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    admin.results.usuario = [fila({ sucursal_id: 1, sucursal: { id: 1, nombre: 'Casa Matriz' } })];
    admin.results.sucursal = [
      fila([
        { id: 1, nombre: 'Casa Matriz' },
        { id: 2, nombre: 'Norte' },
      ]),
    ];

    const res = await OrganizacionService.usuarioTieneSucursal('u-1', 2);

    expect(res).toBe(true);
  });

  it('should_return_false_when_fallback_does_not_include_the_branch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    admin.results.usuario = [fila({ sucursal_id: 1, sucursal: { id: 1, nombre: 'Casa Matriz' } })];
    admin.results.sucursal = [fila([{ id: 1, nombre: 'Casa Matriz' }])];

    const res = await OrganizacionService.usuarioTieneSucursal('u-1', 9);

    expect(res).toBe(false);
  });
});