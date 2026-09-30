import { describe, it, expect } from 'vitest';
import {
  cardsPorRol,
  puedeVerCard,
  seccionesPorRol,
  tituloDeCard,
  DASHBOARD_CARDS,
  SECCIONES,
} from '@/config/dashboard-cards';
import { UserRole } from '@/types/auth.types';

const ROLES: UserRole[] = ['administrador', 'ejecutivo', 'jefe_local', 'logistica', 'operaciones'];

describe('config/dashboard-cards', () => {
  describe('integridad del catálogo', () => {
    it('debería_no_tener_claves_duplicadas', () => {
      const claves = DASHBOARD_CARDS.map((c) => c.clave);
      expect(new Set(claves).size).toBe(claves.length);
    });

    it('no_debería_tener_orden_duplicado_dentro_del_mismo_grupo', () => {
      const vistos = new Set<string>();
      for (const card of DASHBOARD_CARDS) {
        const clave = `${card.grupo}:${card.orden}`;
        expect(vistos.has(clave)).toBe(false);
        vistos.add(clave);
      }
    });

    it('no_debería_tener_href_duplicados', () => {
      const hrefs = DASHBOARD_CARDS.map((c) => c.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('debería_todas_las_cards_tener_descripcion_y_al_menos_una_accion', () => {
      for (const card of DASHBOARD_CARDS) {
        expect(card.descripcion.length).toBeGreaterThan(10);
        expect(card.acciones.length).toBeGreaterThan(0);
        expect(card.icono.length).toBeGreaterThan(0);
      }
    });

    it('debería_todas_las_cards_usar_un_grupo_declarado', () => {
      const grupos = SECCIONES.map((s) => s.grupo);
      for (const card of DASHBOARD_CARDS) {
        expect(grupos).toContain(card.grupo);
      }
    });

    it('debería_todas_las_cards_soloAdmin_estar_restringidas_al_administrador', () => {
      for (const card of DASHBOARD_CARDS.filter((c) => c.soloAdmin)) {
        expect(Object.keys(card.tituloPorRol)).toHaveLength(0);
        for (const rol of ROLES.filter((r) => r !== 'administrador')) {
          expect(puedeVerCard(card, rol)).toBe(false);
        }
      }
    });
  });

  describe('tituloDeCard', () => {
    it('debería_devolver_el_titulo_por_rol_cuando_existe', () => {
      const solicitudes = DASHBOARD_CARDS.find((c) => c.clave === 'solicitudes')!;
      expect(tituloDeCard(solicitudes, 'jefe_local')).toBe('Solicitudes');
      expect(tituloDeCard(solicitudes, 'logistica')).toBe('Solicitudes');
    });

    it('debería_caer_al_titulo_admin_cuando_el_rol_no_tiene_titulo_propio', () => {
      const historial = DASHBOARD_CARDS.find((c) => c.clave === 'historial')!;
      expect(tituloDeCard(historial, 'administrador')).toBe('Historial y Trazabilidad');
      expect(tituloDeCard(historial, 'jefe_local')).toBe('Historial y Trazabilidad');
    });

    it('debería_denombrar_operaciones_como_carga_de_vehiculos', () => {
      const vehiculos = DASHBOARD_CARDS.find((c) => c.clave === 'vehiculos')!;
      expect(tituloDeCard(vehiculos, 'operaciones')).toBe('Carga de vehículos');
      expect(tituloDeCard(vehiculos, 'administrador')).toBe('Gestión de Vehículos');
    });

    it('debería_nombrar_la_gestion_logistica_calendarizacion_para_no_admin', () => {
      const logistica = DASHBOARD_CARDS.find((c) => c.clave === 'logistica')!;
      expect(tituloDeCard(logistica, 'jefe_local')).toBe('Calendarización de traslados');
      expect(tituloDeCard(logistica, 'logistica')).toBe('Calendarización de traslados');
      expect(tituloDeCard(logistica, 'administrador')).toBe('Gestión Logística');
    });
  });

  describe('cardsPorRol', () => {
    it('debería_el_administrador_ver_todas_las_cards', () => {
      expect(cardsPorRol('administrador')).toHaveLength(DASHBOARD_CARDS.length);
    });

    it('debería_el_ejecutivo_no_ver_ninguna_card_porque_usa_solicitudes_como_pagina_principal', () => {
      expect(cardsPorRol('ejecutivo')).toEqual([]);
    });

    it('debería_el_jefe_local_ver_las_cards_de_gestion_operacion_y_soporte', () => {
      expect(cardsPorRol('jefe_local').map((c) => c.clave).sort()).toEqual([
        'aprobaciones',
        'logistica',
        'prioridades',
        'slots',
        'solicitudes',
        'traslados',
        'vehiculos',
      ]);
    });

    it('no_debería_el_ejecutivo_ver_ni_prioridades_ni_historial_ni_usuarios', () => {
      const claves = cardsPorRol('ejecutivo').map((c) => c.clave);
      expect(claves).not.toContain('prioridades');
      expect(claves).not.toContain('historial');
      expect(claves).not.toContain('usuarios');
      expect(claves).not.toContain('vehiculos');
      expect(claves).not.toContain('logistica');
      expect(claves).not.toContain('traslados');
    });

    it('no_debería_ningun_rol_sin_sucursales_ver_gestion_zonas_sucursales', () => {
      for (const rol of ROLES.filter((r) => r !== 'administrador')) {
        expect(cardsPorRol(rol).map((c) => c.clave)).not.toContain('sucursales');
      }
    });

    it('no_debería_operaciones_ver_el_flujo_de_solicitudes', () => {
      expect(cardsPorRol('operaciones').map((c) => c.clave)).toEqual(['vehiculos']);
    });

    it('debería_logistica_ver_solicitudes_traslados_calendarizacion_y_slots', () => {
      expect(cardsPorRol('logistica').map((c) => c.clave).sort()).toEqual([
        'logistica',
        'slots',
        'solicitudes',
        'traslados',
        'vehiculos',
      ]);
    });

    it('debería_devolver_las_cards_ordenadas_por_orden', () => {
      for (const rol of ROLES) {
        const ordenes = cardsPorRol(rol).map((c) => c.orden);
        expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
      }
    });

    it('debería_ser_estable_entre_llamadas', () => {
      expect(cardsPorRol('jefe_local')).toEqual(cardsPorRol('jefe_local'));
    });
  });

  describe('seccionesPorRol', () => {
    it('debería_no_incluir_grupos_vacios', () => {
      const grupos = seccionesPorRol('operaciones').map((s) => s.grupo);
      expect(grupos).toEqual(['soporte']);
    });

    it('debería_no_devolver_ninguna_sección_para_el_ejecutivo', () => {
      expect(seccionesPorRol('ejecutivo')).toEqual([]);
    });

    it('debería_conservar_el_orden_de_las_secciones', () => {
      const esperados = SECCIONES.map((s) => s.grupo).filter((g) =>
        seccionesPorRol('administrador').some((s) => s.grupo === g)
      );
      expect(seccionesPorRol('administrador').map((s) => s.grupo)).toEqual(esperados);
    });

    it('debería_cubrir_todas_las_cards_del_rol_entre_las_secciones', () => {
      for (const rol of ROLES) {
        const total = seccionesPorRol(rol).reduce((acc, s) => acc + s.cards.length, 0);
        expect(total).toBe(cardsPorRol(rol).length);
      }
    });

    it('debería_poner_las_cards_de_prioridad_del_jefe_local_en_gestion', () => {
      const gestion = seccionesPorRol('jefe_local').find((s) => s.grupo === 'gestion')!;
      expect(gestion.cards.map((c) => c.clave)).toContain('prioridades');
    });

    it('debería_dejar_los_enlaces_de_tu_cuenta_fuera_de_las_secciones_de_módulos', () => {
      const grupos = new Set(seccionesPorRol('administrador').map((s) => s.grupo));
      expect(grupos).not.toContain('cuenta');
    });
  });
});