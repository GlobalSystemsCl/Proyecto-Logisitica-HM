import { describe, expect, it } from 'vitest';
import { getSolicitudesTabs, tabSolicitudesDePath, SolicitudesTab, TabSolicitudes } from '@/lib/solicitudes-tabs';

function labels(tabs: SolicitudesTab[]): string[] {
  return tabs.map((t) => t.label);
}

describe('getSolicitudesTabs', () => {
  it('should_devolver_todas_las_tabs_para_jefe_local', () => {
    const res = getSolicitudesTabs('jefe_local', 'general');
    expect(labels(res)).toEqual(['General', 'Traslados', 'Aprobaciones', 'Prioridades']);
  });

  it('should_devolver_todas_las_tabs_para_administrador', () => {
    const res = getSolicitudesTabs('administrador', 'general');
    expect(labels(res)).toEqual(['General', 'Traslados', 'Aprobaciones', 'Prioridades']);
  });

  it('should_devolver_solo_general_y_traslados_para_logistica', () => {
    const res = getSolicitudesTabs('logistica', 'general');
    expect(labels(res)).toEqual(['General', 'Traslados']);
  });

  it('should_devolver_solo_general_y_aprobaciones_para_ejecutivo', () => {
    const res = getSolicitudesTabs('ejecutivo', 'general');
    expect(labels(res)).toEqual(['General', 'Aprobaciones']);
  });

  it('should_devolver_lista_vacia_para_operaciones', () => {
    const res = getSolicitudesTabs('operaciones', 'general');
    expect(res).toEqual([]);
  });

  it('should_marcar_activa_solo_la_tab_correspondiente', () => {
    const tabs: TabSolicitudes[] = ['general', 'traslados', 'aprobaciones', 'prioridades'];
    tabs.forEach((activo) => {
      const res = getSolicitudesTabs('jefe_local', activo);
      expect(res.filter((t) => t.active).map((t) => t.label)).toEqual([
        res.find((t) => t.href.endsWith(`/solicitudes${activo === 'general' ? '' : `/${activo}`}`))!.label,
      ]);
    });
  });

  it('should_mantener_hrefs_correctos', () => {
    const res = getSolicitudesTabs('jefe_local', 'traslados');
    expect(res.map((t) => t.href)).toEqual([
      '/solicitudes',
      '/solicitudes/traslados',
      '/solicitudes/aprobaciones',
      '/solicitudes/prioridades',
    ]);
  });
});

describe('tabSolicitudesDePath', () => {
  it('should_devolver_general_para_la_raiz_del_modulo', () => {
    expect(tabSolicitudesDePath('/solicitudes')).toBe('general');
  });

  it('should_devolver_la_tab_segun_la_ruta', () => {
    expect(tabSolicitudesDePath('/solicitudes/traslados')).toBe('traslados');
    expect(tabSolicitudesDePath('/solicitudes/aprobaciones')).toBe('aprobaciones');
    expect(tabSolicitudesDePath('/solicitudes/prioridades')).toBe('prioridades');
  });

  it('should_devolver_general_para_rutas_desconocidas_o_sin_slash_final', () => {
    expect(tabSolicitudesDePath('/solicitudes/otra')).toBe('general');
    expect(tabSolicitudesDePath('/')).toBe('general');
    expect(tabSolicitudesDePath('/solicitudes/')).toBe('general');
  });
});