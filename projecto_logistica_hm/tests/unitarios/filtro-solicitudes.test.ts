import { describe, expect, it } from 'vitest';
import {
  GRUPOS_FILTRO_SOLICITUDES,
  coincideBusqueda,
  contarPorGrupo,
  destinoDeSolicitud,
  estadoEnGrupo,
  ESTADOS_CERRADOS,
  filtrarPorGrupo,
  grupoFiltro,
  grupoInicialSolicitudes,
  type GrupoFiltroSolicitud,
} from '@/lib/filtroSolicitudes';
import type { EstadoSolicitud, SolicitudLista } from '@/types/solicitud.types';

function solicitud(estado: EstadoSolicitud, extra: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: `sol-${estado}`,
    estado,
    tipo_solicitud: 'venta',
    sucursal: 1,
    sucursal_nombre: 'Sucursal Norte',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Sucursal Sur',
    titulo_evento: null,
    direccion_evento: null,
    fecha_limite: null,
    ...extra,
  } as SolicitudLista;
}

describe('GRUPOS_FILTRO_SOLICITUDES', () => {
  it('should_cubrir_todos_los_estados_del_enum_sin_omitir_ninguno', () => {
    const estadosCubiertos = new Set(
      GRUPOS_FILTRO_SOLICITUDES.filter((g) => g.id !== 'todas').flatMap((g) => g.estados)
    );
    const estadosEnum: EstadoSolicitud[] = [
      'pendiente_aprobacion',
      'aprobada',
      'pendiente',
      'priorizada',
      'asignada',
      'calendarizada',
      'despachada',
      'en_transito',
      'entregada',
      'finalizada',
      'cancelada',
      'rechazada',
    ];
    expect([...estadosEnum].filter((e) => !estadosCubiertos.has(e))).toEqual([]);
    expect([...estadosCubiertos].every((e) => estadosEnum.includes(e))).toBe(true);
  });

  it('should_no_repetir_estados_entre_grupos', () => {
    const todos = GRUPOS_FILTRO_SOLICITUDES.filter((g) => g.id !== 'todas').flatMap((g) => g.estados);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('should_incluir_en_todas_solo_estados_no_cerrados', () => {
    const todas = grupoFiltro('todas');
    expect(todas.label).toBe('Activas');
    expect(todas.estados.length).toBeGreaterThan(0);
    expect(todas.estados.some((e) => ESTADOS_CERRADOS.includes(e))).toBe(false);
  });

  it('should_cubrir_en_todas_exactamente_pendientes_en_curso_y_por_entregar', () => {
    const activos = ['pendientes', 'en_curso', 'por_entregar'].flatMap((id) => grupoFiltro(id).estados);
    expect([...grupoFiltro('todas').estados].sort()).toEqual([...activos].sort());
  });
});

describe('grupoFiltro', () => {
  it('should_retornar_el_grupo_solicitado_when_id_valido', () => {
    expect(grupoFiltro('por_entregar').label).toBe('Por entregar');
  });

  it('should_retornar_todas_when_id_desconocido', () => {
    expect(grupoFiltro('no-existe').id).toBe('todas');
  });
});

describe('estadoEnGrupo', () => {
  it('should_devolver_true_when_estado_pertenece_al_grupo', () => {
    expect(estadoEnGrupo('entregada', 'por_entregar')).toBe(true);
    expect(estadoEnGrupo('rechazada', 'rechazadas')).toBe(true);
  });

  it('should_devolver_false_when_estado_no_pertenece_al_grupo', () => {
    expect(estadoEnGrupo('entregada', 'pendientes')).toBe(false);
  });

  it('should_devolver_true_when_estado_activo_y_grupo_todas', () => {
    expect(estadoEnGrupo('pendiente_aprobacion', 'todas')).toBe(true);
    expect(estadoEnGrupo('entregada', 'todas')).toBe(true);
  });

  it('should_devolver_false_when_estado_cerrado_y_grupo_todas', () => {
    expect(estadoEnGrupo('finalizada', 'todas')).toBe(false);
    expect(estadoEnGrupo('rechazada', 'todas')).toBe(false);
    expect(estadoEnGrupo('cancelada', 'todas')).toBe(false);
  });
});

describe('filtrarPorGrupo', () => {
  const lista = [
    solicitud('pendiente_aprobacion'),
    solicitud('aprobada'),
    solicitud('en_transito'),
    solicitud('entregada'),
    solicitud('rechazada'),
    solicitud('finalizada'),
  ];

  it('should_excluir_cerradas_when_grupo_todas', () => {
    const resultado = filtrarPorGrupo(lista, 'todas');
    expect(resultado.map((s) => s.estado)).toEqual(['pendiente_aprobacion', 'aprobada', 'en_transito', 'entregada']);
    expect(resultado).not.toBe(lista);
  });

  it('should_incluir_canceladas_when_grupo_rechazadas', () => {
    const resultado = filtrarPorGrupo([solicitud('cancelada'), solicitud('rechazada')], 'rechazadas');
    expect(resultado).toHaveLength(2);
  });

  it('should_solo_entregar_por_entregar_when_grupo_por_entregar', () => {
    const resultado = filtrarPorGrupo(lista, 'por_entregar');
    expect(resultado.map((s) => s.estado)).toEqual(['entregada']);
  });

  it('should_agrupar_aprobada_hasta_en_transito_when_grupo_en_curso', () => {
    const resultado = filtrarPorGrupo(lista, 'en_curso');
    expect(resultado.map((s) => s.estado)).toEqual(['aprobada', 'en_transito']);
  });

  it('should_devolver_lista_vacia_when_ningun_elemento_pertence', () => {
    expect(filtrarPorGrupo([solicitud('pendiente')], 'finalizadas')).toEqual([]);
  });

  it('should_devolver_lista_vacia_when_entrada_vacia', () => {
    expect(filtrarPorGrupo([], 'todas')).toEqual([]);
  });

  it('should_no_mutar_el_arreglo_original', () => {
    const original = [solicitud('entregada'), solicitud('finalizada')];
    filtrarPorGrupo(original, 'finalizadas');
    expect(original).toHaveLength(2);
  });
});

describe('contarPorGrupo', () => {
  it('should_contar_cada_solicitud_en_su_grupo_y_en_todas', () => {
    const conteo = contarPorGrupo([
      solicitud('pendiente_aprobacion'),
      solicitud('pendiente'),
      solicitud('aprobada'),
      solicitud('entregada'),
    ]);
    const esperado: Record<GrupoFiltroSolicitud, number> = {
      todas: 4,
      pendientes: 2,
      en_curso: 1,
      por_entregar: 1,
      rechazadas: 0,
      finalizadas: 0,
    };
    expect(conteo).toEqual(esperado);
  });

  it('should_devolver_todos_en_cero_when_lista_vacia', () => {
    expect(contarPorGrupo([])).toEqual({
      todas: 0,
      pendientes: 0,
      en_curso: 0,
      por_entregar: 0,
      rechazadas: 0,
      finalizadas: 0,
    });
  });

  it('should_no_contar_cerradas_en_todas', () => {
    const conteo = contarPorGrupo([
      solicitud('aprobada'),
      solicitud('finalizada'),
      solicitud('rechazada'),
      solicitud('cancelada'),
    ]);
    expect(conteo.todas).toBe(1);
    expect(conteo.finalizadas).toBe(1);
    expect(conteo.rechazadas).toBe(2);
  });
});

describe('grupoInicialSolicitudes', () => {
  it('should_respetar_grupo_de_la_url_when_es_valido', () => {
    expect(grupoInicialSolicitudes('en_curso', 'ejecutivo')).toBe('en_curso');
    expect(grupoInicialSolicitudes('todas', 'jefe_local')).toBe('todas');
  });

  it('should_partir_por_entregar_when_ejecutivo_o_jefe_local_sin_grupo', () => {
    expect(grupoInicialSolicitudes(undefined, 'ejecutivo')).toBe('por_entregar');
    expect(grupoInicialSolicitudes(undefined, 'jefe_local')).toBe('por_entregar');
  });

  it('should_partir_por_activas_when_otro_rol_sin_grupo', () => {
    expect(grupoInicialSolicitudes(undefined, 'administrador')).toBe('todas');
    expect(grupoInicialSolicitudes(undefined, 'logistica')).toBe('todas');
  });

  it('should_ignorar_grupo_invalido_o_no_string', () => {
    expect(grupoInicialSolicitudes('no-existe', 'ejecutivo')).toBe('por_entregar');
    expect(grupoInicialSolicitudes(['en_curso'], 'administrador')).toBe('todas');
  });
});

describe('destinoDeSolicitud', () => {
  it('should_devolver_sucursal_destino_when_tipo_venta', () => {
    expect(destinoDeSolicitud(solicitud('aprobada'))).toBe('Sucursal Sur');
  });

  it('should_devolver_id_sucursal_when_venta_sin_nombre', () => {
    const sol = solicitud('aprobada', { sucursal_destino_nombre: null, sucursal_destino: 7 });
    expect(destinoDeSolicitud(sol)).toBe('#7');
  });

  it('should_devolver_guion_when_venta_sin_destino', () => {
    const sol = solicitud('aprobada', { sucursal_destino_nombre: null, sucursal_destino: null });
    expect(destinoDeSolicitud(sol)).toBe('—');
  });

  it('should_devolver_direccion_del_evento_when_tipo_evento', () => {
    const sol = solicitud('aprobada', {
      tipo_solicitud: 'evento',
      direccion_evento: 'Av. Siempre Viva 742',
    });
    expect(destinoDeSolicitud(sol)).toBe('Av. Siempre Viva 742');
  });

  it('should_devolver_titulo_del_evento_when_no_hay_direccion', () => {
    const sol = solicitud('aprobada', {
      tipo_solicitud: 'evento',
      direccion_evento: null,
      titulo_evento: 'Expo Norte',
    });
    expect(destinoDeSolicitud(sol)).toBe('Expo Norte');
  });
});

describe('coincideBusqueda', () => {
  const sol = solicitud('entregada', {
    id: 'ABC12345-0000',
    ejecutivo_nombre: 'Ana Pérez',
    jefe_local_nombre: 'Luis Gómez',
    logistica_nombre: 'Marta Ruiz',
    vehiculos: [{ id: 'v1', patente: 'ABCD123', chasis: 'CH1' } as never],
  });

  it('should_coincidir_siempre_when_termino_vacio', () => {
    expect(coincideBusqueda(sol, '')).toBe(true);
    expect(coincideBusqueda(sol, '   ')).toBe(true);
  });

  it('should_coincidir_when_id_contiene_el_termino', () => {
    expect(coincideBusqueda(sol, 'abc123')).toBe(true);
  });

  it('should_coincidir_por_cualquier_campo_del_usuario', () => {
    expect(coincideBusqueda(sol, 'norte')).toBe(true);
    expect(coincideBusqueda(sol, 'ana')).toBe(true);
    expect(coincideBusqueda(sol, 'luis')).toBe(true);
    expect(coincideBusqueda(sol, 'marta')).toBe(true);
    expect(coincideBusqueda(sol, 'sur')).toBe(true);
    expect(coincideBusqueda(sol, 'abcd123')).toBe(true);
  });

  it('should_devolver_false_when_nada_coincide', () => {
    expect(coincideBusqueda(sol, 'zzzz')).toBe(false);
  });
});
