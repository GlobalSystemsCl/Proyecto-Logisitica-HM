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