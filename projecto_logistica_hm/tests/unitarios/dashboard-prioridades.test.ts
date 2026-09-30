import { describe, it, expect } from 'vitest';
import {
  agruparPorSucursal,
  seleccionarVisibles,
  MAX_FILAS_PRIORIDADES,
  UMBRAL_URGENTE,
} from '@/components/DashboardPrioridades';
import type { SolicitudLista, VehiculoAsociado } from '@/types/solicitud.types';

function vehiculo(patente: string): VehiculoAsociado {
  return {
    solicitud_vehiculo_id: `sv-${patente}`,
    disponibilidad: 'reservado',
    patente,
    chasis: `CH-${patente}`,
    marca: 'Toyota',
    modelo: 'Etios',
    anio: 2020,
    color: 'Blanco',
  };
}

function solicitud(over: Partial<SolicitudLista> & { id: string }): SolicitudLista {
  return {
    sucursal: 1,
    sucursal_nombre: 'Sucursal Centro',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Sucursal Norte',
    estado: 'priorizada',
    tipo_solicitud: 'traslado',
    posicion_prioridad: 1,
    ejecutivo_id: 'e1',
    ejecutivo_nombre: 'Ana Pérez',
    jefe_local_id: 'j1',
    jefe_local_nombre: 'Jefe Uno',
    logistica_id: null,
    logistica_nombre: null,
    fecha_creacion: '2026-01-01T10:00:00Z',
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: '2026-02-01T00:00:00Z',
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: 1,
    vehiculos: [vehiculo('ABCD12')],
    ...over,
  } as SolicitudLista;
}

describe('components/DashboardPrioridades > agruparPorSucursal', () => {
  it('debería_ordenar_la_cola_por_posicion_ascendente', () => {
    const cola = [
      solicitud({ id: 'c', posicion_prioridad: 2 }),
      solicitud({ id: 'b', posicion_prioridad: 3 }),
      solicitud({ id: 'a', posicion_prioridad: 1 }),
    ];

    expect(colaDe(agruparPorSucursal(cola))).toEqual(['a', 'c', 'b']);
  });

  it('debería_ignorar_las_solicitudes_sin_posicion_de_prioridad', () => {
    const cola = [
      solicitud({ id: 'a', posicion_prioridad: 1 }),
      solicitud({ id: 'x', posicion_prioridad: null }),
    ];

    const resumen = agruparPorSucursal(cola);
    expect(resumen.total).toBe(1);
    expect(colaDe(resumen)).toEqual(['a']);
  });

  it('debería_agrupar_por_sucursal_de_origen', () => {
    const cola = [
      solicitud({ id: 'a', sucursal: 1, sucursal_nombre: 'Centro', posicion_prioridad: 1 }),
      solicitud({ id: 'b', sucursal: 2, sucursal_nombre: 'Norte', posicion_prioridad: 2 }),
      solicitud({ id: 'c', sucursal: 1, sucursal_nombre: 'Centro', posicion_prioridad: 3 }),
    ];

    const resumen = agruparPorSucursal(cola);
    expect(resumen.grupos).toHaveLength(2);
    expect(resumen.grupos.map((g) => g.sucursal).sort()).toEqual([1, 2]);
    expect(resumen.grupos.find((g) => g.sucursal === 1)!.filas.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('debería_ordenar_los_grupos_alfabéticamente_por_nombre', () => {
    const cola = [
      solicitud({ id: 'a', sucursal: 9, sucursal_nombre: 'Zona Sur' }),
      solicitud({ id: 'b', sucursal: 1, sucursal_nombre: 'Centro' }),
    ];

    expect(agruparPorSucursal(cola).grupos.map((g) => g.nombre)).toEqual(['Centro', 'Zona Sur']);
  });

  it('debería_respetar_el_nombre_de_la_sucursal_con_respaldo_si_es_nulo', () => {
    const cola = [solicitud({ id: 'a', sucursal: 7, sucursal_nombre: null })];

    expect(agruparPorSucursal(cola).grupos[0].nombre).toBe('Sucursal #7');
  });

  it('debería_contar_como_urgentes_las_posiciones_hasta_el_umbral', () => {
    const cola = [
      solicitud({ id: 'a', posicion_prioridad: 1 }),
      solicitud({ id: 'b', posicion_prioridad: UMBRAL_URGENTE }),
      solicitud({ id: 'c', posicion_prioridad: UMBRAL_URGENTE + 1 }),
    ];

    expect(agruparPorSucursal(cola).urgentes).toBe(2);
  });

  it('debería_traspasar_el_contador_de_pendientes_de_aprobación', () => {
    expect(agruparPorSucursal([], 7).porAprobar).toBe(7);
    expect(agruparPorSucursal([], 7).total).toBe(0);
  });

  it('debería_devolver_cola_vacía_sin_lanzar_error', () => {
    const resumen = agruparPorSucursal([]);
    expect(resumen).toEqual({ grupos: [], total: 0, urgentes: 0, porAprobar: 0 });
  });

  it('debería_no_mutar_el_arreglo_recibido', () => {
    const cola = [
      solicitud({ id: 'b', posicion_prioridad: 5 }),
      solicitud({ id: 'a', posicion_prioridad: 1 }),
    ];
    const copia = [...cola];

    agruparPorSucursal(cola);
    expect(cola).toEqual(copia);
  });

  it('debería_definir_un_tope_de_filas_visibles_mayor_que_cero', () => {
    expect(MAX_FILAS_PRIORIDADES).toBeGreaterThan(0);
    expect(MAX_FILAS_PRIORIDADES).toBeLessThanOrEqual(10);
  });
});

describe('components/DashboardPrioridades > seleccionarVisibles', () => {
  function colaDeN(n: number, sucursal = 1) {
    return Array.from({ length: n }, (_, i) =>
      solicitud({ id: `s${i + 1}`, sucursal, posicion_prioridad: i + 1 })
    );
  }

  it('debería_marcar_todas_las_filas_cuando_no_superan_el_tope', () => {
    const { grupos } = agruparPorSucursal(colaDeN(3));
    expect([...seleccionarVisibles(grupos, 8)]).toEqual(['s1', 's2', 's3']);
  });

  it('debería_recortar_alla_primera_posición_al_superar_el_tope', () => {
    const { grupos } = agruparPorSucursal(colaDeN(10));
    const visibles = seleccionarVisibles(grupos, MAX_FILAS_PRIORIDADES);

    expect(visibles.size).toBe(MAX_FILAS_PRIORIDADES);
    expect(visibles.has('s1')).toBe(true);
    expect(visibles.has(`s${MAX_FILAS_PRIORIDADES}`)).toBe(true);
    expect(visibles.has(`s${MAX_FILAS_PRIORIDADES + 1}`)).toBe(false);
  });

  it('debería_consumir_el_tope_en_el_orden_de_mostrar_entre_varios_grupos', () => {
    const cola = [
      solicitud({ id: 'a1', sucursal: 1, sucursal_nombre: 'Norte', posicion_prioridad: 1 }),
      solicitud({ id: 'c1', sucursal: 3, sucursal_nombre: 'Centro', posicion_prioridad: 1 }),
    ];
    // Los grupos se muestran por nombre: "Centro" antes que "Norte".
    const visibles = seleccionarVisibles(agruparPorSucursal(cola).grupos, 1);

    expect(visibles.size).toBe(1);
    expect(visibles.has('c1')).toBe(true);
    expect(visibles.has('a1')).toBe(false);
  });

  it('debería_devolver_conjunto_vacío_con_límite_cero_o_negativo', () => {
    const { grupos } = agruparPorSucursal(colaDeN(3));
    expect(seleccionarVisibles(grupos, 0).size).toBe(0);
    expect(seleccionarVisibles(grupos, -1).size).toBe(0);
  });

  it('debería_devolver_conjunto_vacío_sin_filas', () => {
    expect(seleccionarVisibles([], 8).size).toBe(0);
  });
});

function colaDe(resumen: ReturnType<typeof agruparPorSucursal>): string[] {
  return resumen.grupos.flatMap((g) => g.filas.map((f) => f.id));
}