import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coincideBusquedaBandeja, coincideBusquedaTraslado } from '@/lib/buscadorBandeja';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';

beforeEach(() => {
  vi.clearAllMocks();
});

function solicitud(extra: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'abc12345-0000-0000-0000-000000000000',
    estado: 'pendiente_aprobacion',
    tipo_solicitud: 'venta',
    sucursal: 101,
    numero: 15,
    sucursal_nombre: 'Peñalolén',
    sucursal_destino: 205,
    sucursal_destino_nombre: 'Viña del Mar',
    creado_por: 'u1',
    creado_por_nombre: 'Ana Pérez',
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    vehiculos: [],
    ...extra,
  } as SolicitudLista;
}

function traslado(extra: Partial<TrasladoInterno> = {}): TrasladoInterno {
  return {
    id: 'def67890-0000-0000-0000-000000000000',
    numero: 42,
    origen_id: 101,
    origen_nombre: 'Peñalolén',
    destino_id: 205,
    destino_nombre: 'Viña del Mar',
    logistica_nombre: 'Marta Ruiz',
    vehiculos: [],
    ...extra,
  } as TrasladoInterno;
}

describe('coincideBusquedaBandeja', () => {
  it('should_coincidir_siempre_when_termino_vacio', () => {
    expect(coincideBusquedaBandeja(solicitud(), '')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), '   ')).toBe(true);
  });

  it('should_coincidir_when_termino_es_el_numero_de_solicitud', () => {
    expect(coincideBusquedaBandeja(solicitud(), '101-15')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), '#101-1')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), '101-16')).toBe(false);
  });

  it('should_coincidir_when_termino_es_el_nombre_del_iniciador_sin_tildes', () => {
    expect(coincideBusquedaBandeja(solicitud(), 'perez')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), 'ANA')).toBe(true);
  });

  it('should_usar_el_ejecutivo_when_no_hay_creado_por', () => {
    const antigua = solicitud({ creado_por: null, creado_por_nombre: null, ejecutivo_id: 'e1', ejecutivo_nombre: 'Luis Gómez' });
    expect(coincideBusquedaBandeja(antigua, 'gomez')).toBe(true);
  });

  it('should_coincidir_when_termino_es_codigo_o_nombre_de_sucursal_origen_o_destino', () => {
    expect(coincideBusquedaBandeja(solicitud(), 'penalolen')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), 'viña')).toBe(true);
    expect(coincideBusquedaBandeja(solicitud(), '205')).toBe(true);
  });

  it('should_devolver_false_when_nada_coincide', () => {
    expect(coincideBusquedaBandeja(solicitud(), 'zzz')).toBe(false);
  });

  it('should_no_fallar_when_faltan_nombres', () => {
    const sinDatos = solicitud({ sucursal_nombre: null, sucursal_destino: null, sucursal_destino_nombre: null, creado_por_nombre: null } as Partial<SolicitudLista>);
    expect(coincideBusquedaBandeja(sinDatos, 'zzz')).toBe(false);
  });
});

describe('coincideBusquedaTraslado', () => {
  it('should_coincidir_siempre_when_termino_vacio', () => {
    expect(coincideBusquedaTraslado(traslado(), '')).toBe(true);
  });

  it('should_coincidir_when_termino_es_el_numero_del_traslado', () => {
    expect(coincideBusquedaTraslado(traslado(), 't-42')).toBe(true);
    expect(coincideBusquedaTraslado(traslado(), 'T-43')).toBe(false);
  });

  it('should_coincidir_when_termino_es_sucursal_o_logistica', () => {
    expect(coincideBusquedaTraslado(traslado(), 'vina')).toBe(true);
    expect(coincideBusquedaTraslado(traslado(), '101')).toBe(true);
    expect(coincideBusquedaTraslado(traslado(), 'marta')).toBe(true);
  });

  it('should_coincidir_por_uuid_corto_when_no_tiene_numero', () => {
    expect(coincideBusquedaTraslado(traslado({ numero: null }), '#DEF6')).toBe(true);
  });

  it('should_devolver_false_when_nada_coincide', () => {
    expect(coincideBusquedaTraslado(traslado(), 'zzz')).toBe(false);
  });
});
