import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

const { ReporteService } = await import('@/services/reporte.service');

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ReporteService.getEventosLogistica', () => {
  it('should_read_logistics_actions_of_solicitudes', async () => {
    admin.results.auditoria = [fila([{ entidad_id: 's1', usuario_id: 'u', accion: 'calendarizacion', created_at: 'x' }])];

    const res = await ReporteService.getEventosLogistica();

    expect(res).toHaveLength(1);
    expect(admin.callsTo('auditoria')).toContainEqual(['eq', 'entidad', 'solicitud']);
    expect(admin.callsTo('auditoria')).toContainEqual([
      'in',
      'accion',
      ['calendarizacion', 'recalendarizacion', 'cancelacion_transito'],
    ]);
  });

  it('should_paginate_until_a_partial_page', async () => {
    const pagina = Array.from({ length: 1000 }, (_, i) => ({ entidad_id: `s${i}`, usuario_id: 'u', accion: 'calendarizacion', created_at: 'x' }));
    admin.results.auditoria = [fila(pagina), fila([pagina[0]])];

    const res = await ReporteService.getEventosLogistica();

    expect(res).toHaveLength(1001);
    expect(admin.callsTo('auditoria')).toContainEqual(['range', 1000, 1999]);
  });

  it('should_return_what_was_read_when_a_page_fails', async () => {
    admin.results.auditoria = [{ data: null, error: { message: 'x' } }];
    expect(await ReporteService.getEventosLogistica()).toEqual([]);
  });
});

describe('ReporteService.getUsuariosLogistica', () => {
  it('should_return_active_logistics_users_with_full_name', async () => {
    admin.results.usuario = [fila([{ id: 'a', nombre: 'Ana', apellido: 'Paz' }])];

    expect(await ReporteService.getUsuariosLogistica()).toEqual([{ id: 'a', nombre: 'Ana Paz' }]);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'rol', 'logistica']);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'activo', true]);
  });

  it('should_return_empty_on_error', async () => {
    admin.results.usuario = [{ data: null, error: { message: 'x' } }];
    expect(await ReporteService.getUsuariosLogistica()).toEqual([]);
  });
});
