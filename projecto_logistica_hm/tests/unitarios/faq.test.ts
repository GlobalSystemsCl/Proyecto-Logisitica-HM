import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ETIQUETA_VISTA,
  PREGUNTAS_FAQ,
  gruposFaq,
  hrefAyuda,
  preguntaVisiblePara,
  vistaDesdeParam,
  vistaDesdeRuta,
  type VistaFaq,
} from '@/config/faq';
import type { UserRole } from '@/types/auth.types';

const ROLES: UserRole[] = ['administrador', 'jefe_local', 'ejecutivo', 'logistica', 'operaciones'];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PREGUNTAS_FAQ', () => {
  it('should_have_non_empty_unique_questions_per_view_and_role', () => {
    for (const rol of ROLES) {
      const claves = PREGUNTAS_FAQ.filter((p) => preguntaVisiblePara(p, rol)).map((p) => `${p.vista}|${p.pregunta}`);
      expect(new Set(claves).size, rol).toBe(claves.length);
    }
    for (const p of PREGUNTAS_FAQ) {
      expect(p.pregunta.trim().length).toBeGreaterThan(0);
      expect(p.respuesta.trim().length).toBeGreaterThan(20);
      expect(ETIQUETA_VISTA[p.vista]).toBeDefined();
    }
  });

  it('should_give_every_role_general_and_profile_questions', () => {
    for (const rol of ROLES) {
      const vistas = gruposFaq(rol).map((g) => g.vista);
      expect(vistas, rol).toContain('general');
      expect(vistas, rol).toContain('perfil');
    }
  });

  it('should_not_mention_old_vendido_label_or_wrong_traslado_rule', () => {
    const texto = PREGUNTAS_FAQ.map((p) => `${p.pregunta} ${p.respuesta}`).join(' ');
    expect(texto).not.toMatch(/vendid/i);
  });
});

describe('vistaDesdeRuta', () => {
  it('should_map_app_routes_to_their_view', () => {
    const casos: Array<[string, VistaFaq]> = [
      ['/solicitudes', 'solicitudes'],
      ['/solicitudes/prioridades', 'prioridades'],
      ['/solicitudes/traslados', 'traslados'],
      ['/logistica/calendarizaciones', 'calendario'],
      ['/logistica/movimientos', 'movimientos'],
      ['/admin/vehiculos', 'inventario'],
      ['/admin/usuarios', 'usuarios'],
      ['/dashboard', 'dashboard'],
      ['/perfil', 'perfil'],
    ];
    for (const [ruta, vista] of casos) expect(vistaDesdeRuta(ruta), ruta).toBe(vista);
  });

  it('should_ignore_query_and_hash_and_require_segment_boundary', () => {
    expect(vistaDesdeRuta('/solicitudes/aprobaciones?x=1#y')).toBe('aprobaciones');
    expect(vistaDesdeRuta('/solicitudesx')).toBe('general');
  });

  it('should_fall_back_to_general_for_unknown_or_missing_route', () => {
    expect(vistaDesdeRuta('/faq')).toBe('general');
    expect(vistaDesdeRuta(null)).toBe('general');
  });
});

describe('vistaDesdeParam', () => {
  it('should_accept_known_view_and_first_value_of_arrays', () => {
    expect(vistaDesdeParam('calendario')).toBe('calendario');
    expect(vistaDesdeParam(['usuarios', 'x'])).toBe('usuarios');
  });

  it('should_return_null_for_unknown_or_missing_view', () => {
    expect(vistaDesdeParam('toString')).toBeNull();
    expect(vistaDesdeParam('nada')).toBeNull();
    expect(vistaDesdeParam(undefined)).toBeNull();
  });
});

describe('hrefAyuda', () => {
  it('should_build_faq_link_with_view_of_route', () => {
    expect(hrefAyuda('/logistica/calendarizaciones')).toBe('/faq?vista=calendario');
    expect(hrefAyuda('/otra')).toBe('/faq?vista=general');
  });
});

describe('preguntaVisiblePara', () => {
  it('should_show_questions_without_roles_to_everyone_and_restricted_ones_only_to_their_roles', () => {
    expect(preguntaVisiblePara({ vista: 'general', pregunta: 'p', respuesta: 'r' }, 'operaciones')).toBe(true);
    const soloAdmin = { vista: 'usuarios' as const, roles: ['administrador'] as const, pregunta: 'p', respuesta: 'r' };
    expect(preguntaVisiblePara(soloAdmin, 'administrador')).toBe(true);
    expect(preguntaVisiblePara(soloAdmin, 'ejecutivo')).toBe(false);
  });
});

describe('gruposFaq', () => {
  it('should_put_current_view_first_and_skip_views_without_questions_for_the_role', () => {
    const grupos = gruposFaq('logistica', 'calendario');
    expect(grupos[0].vista).toBe('calendario');
    expect(grupos[0].titulo).toBe('Calendario de traslados');
    expect(grupos.map((g) => g.vista)).not.toContain('usuarios');
  });

  it('should_hide_admin_and_logistics_views_from_ejecutivo', () => {
    const vistas = gruposFaq('ejecutivo').map((g) => g.vista);
    expect(vistas).not.toContain('usuarios');
    expect(vistas).not.toContain('calendario');
    expect(vistas).toContain('solicitudes');
  });

  it('should_keep_default_order_when_current_view_has_no_questions_for_role', () => {
    const grupos = gruposFaq('operaciones', 'usuarios');
    expect(grupos[0].vista).toBe('general');
    expect(grupos.map((g) => g.vista)).toContain('inventario');
  });
});
