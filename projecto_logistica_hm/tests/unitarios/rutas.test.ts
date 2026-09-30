import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUTAS_AFECTADAS_POR_SOLICITUDES, revalidarSolicitudes } from '@/lib/rutas';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (ruta: string) => revalidatePath(ruta) }));

describe('RUTAS_AFECTADAS_POR_SOLICITUDES', () => {
  it('should_include_the_dashboard_so_the_slots_indicator_refreshes', () => {
    expect(RUTAS_AFECTADAS_POR_SOLICITUDES).toContain('/dashboard');
  });

  it('should_include_the_slots_view_and_every_solicitudes_submodule', () => {
    expect([...RUTAS_AFECTADAS_POR_SOLICITUDES]).toEqual(
      expect.arrayContaining([
        '/logistica/slots',
        '/logistica/calendarizaciones',
        '/solicitudes',
        '/solicitudes/aprobaciones',
        '/solicitudes/prioridades',
        '/solicitudes/traslados',
      ])
    );
  });

  it('should_not_repeat_routes', () => {
    const unicas = new Set(RUTAS_AFECTADAS_POR_SOLICITUDES);
    expect(unicas.size).toBe(RUTAS_AFECTADAS_POR_SOLICITUDES.length);
  });
});

describe('revalidarSolicitudes', () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it('should_revalidate_every_affected_route_exactly_once', () => {
    revalidarSolicitudes();
    expect(revalidatePath).toHaveBeenCalledTimes(RUTAS_AFECTADAS_POR_SOLICITUDES.length);
    for (const ruta of RUTAS_AFECTADAS_POR_SOLICITUDES) {
      expect(revalidatePath).toHaveBeenCalledWith(ruta);
    }
  });

  it('should_revalidate_never_miss_the_dashboard', () => {
    revalidarSolicitudes();
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });
});
