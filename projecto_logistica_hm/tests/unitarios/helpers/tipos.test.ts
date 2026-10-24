import { describe, expect, it } from 'vitest';
import { nombreCompletoUsuario } from '@/types/auth.types';
import { iniciadorId, iniciadorNombre } from '@/lib/iniciador';
import type { SolicitudLista } from '@/types/solicitud.types';

function solicitud(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'sol-1',
    sucursal: 1,
    numero: 1,
    sucursal_nombre: 'Sucursal Centro',
    sucursal_destino: null,
    sucursal_destino_nombre: null,
    estado: 'pendiente_aprobacion',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    logistica_id: null,
    logistica_nombre: null,
    creado_por: null,
    creado_por_nombre: null,
    transportista: null,
    fecha_creacion: '2026-01-15T10:00:00Z',
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: null,
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    sucursal_zona_id: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    vehiculos: [],
    ...overrides,
  };
}

describe('nombreCompletoUsuario', () => {
  it('should_join_nombre_and_apellido', () => {
    expect(nombreCompletoUsuario({ nombre: 'Juan', apellido: 'Pérez' })).toBe('Juan Pérez');
  });

  it('should_return_empty_string_when_user_is_null', () => {
    expect(nombreCompletoUsuario(null)).toBe('');
  });

  it('should_trim_result_when_nombre_or_apellido_is_empty', () => {
    expect(nombreCompletoUsuario({ nombre: 'Juan', apellido: '' })).toBe('Juan');
    expect(nombreCompletoUsuario({ nombre: '', apellido: 'Pérez' })).toBe('Pérez');
  });
});

describe('iniciadorNombre', () => {
  it('should_return_creator_name_when_creado_por_is_set', () => {
    expect(
      iniciadorNombre(
        solicitud({
          creado_por: 'jefe-1',
          creado_por_nombre: 'Ana Díaz',
          ejecutivo_id: 'ejec-1',
          ejecutivo_nombre: 'Juan Pérez',
          jefe_local_id: 'jefe-1',
          jefe_local_nombre: 'Ana Díaz',
        })
      )
    ).toBe('Ana Díaz');
  });

  it('should_show_jefe_local_who_delegated_instead_of_the_delegated_ejecutivo', () => {
    // El jefe de local crea y delega: ejecutivo_id es el delegado, no quien la inició.
    const sol = solicitud({
      creado_por: 'jefe-1',
      creado_por_nombre: 'Ana Díaz',
      ejecutivo_id: 'ejec-1',
      ejecutivo_nombre: 'Juan Pérez',
    });
    expect(iniciadorNombre(sol)).toBe('Ana Díaz');
    expect(iniciadorId(sol)).toBe('jefe-1');
  });

  it('should_fall_back_to_ejecutivo_then_jefe_local_when_creado_por_is_missing', () => {
    expect(iniciadorNombre(solicitud({ ejecutivo_id: 'ejec-1', ejecutivo_nombre: 'Juan Pérez', jefe_local_id: 'jefe-1', jefe_local_nombre: 'Ana Díaz' }))).toBe('Juan Pérez');
    expect(iniciadorNombre(solicitud({ jefe_local_id: 'jefe-1', jefe_local_nombre: 'Ana Díaz' }))).toBe('Ana Díaz');
  });

  it('should_return_null_when_nobody_is_set', () => {
    expect(iniciadorNombre(solicitud())).toBeNull();
  });

  it('should_return_null_name_when_creator_has_no_name_loaded', () => {
    expect(iniciadorNombre(solicitud({ creado_por: 'u-1', creado_por_nombre: null, ejecutivo_id: 'e-1', ejecutivo_nombre: 'X' }))).toBeNull();
  });
});

describe('iniciadorId', () => {
  it('should_prefer_creado_por', () => {
    expect(iniciadorId(solicitud({ creado_por: 'adm-1', ejecutivo_id: 'ejec-1', jefe_local_id: 'jefe-1' }))).toBe('adm-1');
  });

  it('should_fall_back_to_ejecutivo_then_jefe_local', () => {
    expect(iniciadorId(solicitud({ ejecutivo_id: 'ejec-1', jefe_local_id: 'jefe-1' }))).toBe('ejec-1');
    expect(iniciadorId(solicitud({ jefe_local_id: 'jefe-1' }))).toBe('jefe-1');
  });

  it('should_return_null_when_nobody_is_set', () => {
    expect(iniciadorId(solicitud())).toBeNull();
  });
});
