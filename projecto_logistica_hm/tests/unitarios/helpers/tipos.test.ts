import { describe, expect, it } from 'vitest';
import { nombreCompletoUsuario } from '@/types/auth.types';
import { getEncargadoId, getEncargadoNombre, type SolicitudMinima } from '@/services/solicitudes.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import type { SolicitudLista } from '@/types/solicitud.types';

function solicitud(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'sol-1',
    sucursal: 1,
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

function solicitudMinima(overrides: Partial<SolicitudMinima> = {}): SolicitudMinima {
  return {
    id: 'sol-1',
    estado: 'en_transito',
    sucursal: 1,
    sucursal_destino: null,
    ejecutivo_id: null,
    jefe_local_id: null,
    logistica_id: null,
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_inicio_transito: null,
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

describe('getEncargadoNombre', () => {
  it('should_return_ejecutivo_nombre_when_ejecutivo_is_set', () => {
    expect(
      getEncargadoNombre(
        solicitud({
          ejecutivo_id: 'ejec-1',
          ejecutivo_nombre: 'Juan Pérez',
          jefe_local_id: 'jefe-1',
          jefe_local_nombre: 'Ana Díaz',
        })
      )
    ).toBe('Juan Pérez');
  });

  it('should_return_jefe_local_nombre_when_only_jefe_local_is_set', () => {
    expect(
      getEncargadoNombre(solicitud({ jefe_local_id: 'jefe-1', jefe_local_nombre: 'Ana Díaz' }))
    ).toBe('Ana Díaz');
  });

  it('should_return_null_when_no_encargado_is_set', () => {
    expect(getEncargadoNombre(solicitud())).toBeNull();
  });
});

describe('getEncargadoId', () => {
  it('should_return_ejecutivo_id_when_ejecutivo_is_set', () => {
    expect(getEncargadoId(solicitud({ ejecutivo_id: 'ejec-1', jefe_local_id: 'jefe-1' }))).toBe(
      'ejec-1'
    );
  });

  it('should_return_jefe_local_id_when_only_jefe_local_is_set', () => {
    expect(getEncargadoId(solicitud({ jefe_local_id: 'jefe-1' }))).toBe('jefe-1');
  });

  it('should_return_null_when_no_encargado_is_set', () => {
    expect(getEncargadoId(solicitud())).toBeNull();
  });
});

describe('SolicitudesService.usuarioEnSucursalRecepcion', () => {
  it('should_return_true_when_usuario_branch_matches_destination_branch', () => {
    const sol = solicitudMinima({ sucursal: 1, sucursal_destino: 2 });
    expect(SolicitudesService.usuarioEnSucursalRecepcion(2, sol)).toBe(true);
  });

  it('should_return_false_when_usuario_branch_differs_from_destination_branch', () => {
    const sol = solicitudMinima({ sucursal: 1, sucursal_destino: 2 });
    expect(SolicitudesService.usuarioEnSucursalRecepcion(1, sol)).toBe(false);
  });

  it('should_fallback_to_origin_branch_when_solicitud_has_no_destination', () => {
    const sol = solicitudMinima({ sucursal: 1, sucursal_destino: null });
    expect(SolicitudesService.usuarioEnSucursalRecepcion(1, sol)).toBe(true);
    expect(SolicitudesService.usuarioEnSucursalRecepcion(3, sol)).toBe(false);
  });

  it('should_return_false_when_user_has_no_branch_assigned', () => {
    const sol = solicitudMinima({ sucursal: 1, sucursal_destino: 2 });
    expect(SolicitudesService.usuarioEnSucursalRecepcion(null, sol)).toBe(false);
  });
});
