import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MENSAJE_MEZCLA_SUCURSAL,
  clasificarVenta,
  errorAgregarVehiculo,
  estadoAlAprobar,
  mensajeSolicitudAprobada,
  mensajeSolicitudCreada,
} from '@/lib/ventaSucursal';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clasificarVenta', () => {
  it('should_be_without_transfer_when_every_vehicle_is_at_destination', () => {
    expect(clasificarVenta('venta', 101, [101, 101])).toBe('sin_traslado');
  });

  it('should_need_transfer_when_no_vehicle_is_at_destination', () => {
    expect(clasificarVenta('venta', 101, [102, 103])).toBe('con_traslado');
  });

  it('should_be_mixed_when_only_some_are_at_destination', () => {
    expect(clasificarVenta('venta', 101, [101, 102])).toBe('mixta');
  });

  it('should_always_need_transfer_for_events_missing_destination_or_no_vehicles', () => {
    expect(clasificarVenta('evento', 101, [101])).toBe('con_traslado');
    expect(clasificarVenta('venta', null, [101])).toBe('con_traslado');
    expect(clasificarVenta('venta', 101, [])).toBe('con_traslado');
  });
});

describe('estadoAlAprobar', () => {
  it('should_go_straight_to_ready_for_delivery_without_transfer', () => {
    expect(estadoAlAprobar(true)).toBe('entregada');
    expect(estadoAlAprobar(false)).toBe('aprobada');
  });
});

describe('errorAgregarVehiculo', () => {
  it('should_only_allow_vehicles_at_destination_in_a_request_without_transfer', () => {
    expect(errorAgregarVehiculo(true, 'venta', 101, 101)).toBeNull();
    expect(errorAgregarVehiculo(true, 'venta', 101, 102)).toContain('no requiere traslado');
  });

  it('should_reject_vehicles_at_destination_in_a_request_with_transfer', () => {
    expect(errorAgregarVehiculo(false, 'venta', 101, 101)).toBe(MENSAJE_MEZCLA_SUCURSAL);
    expect(errorAgregarVehiculo(false, 'venta', 101, 102)).toBeNull();
    expect(errorAgregarVehiculo(false, 'evento', 101, 101)).toBeNull();
  });
});

describe('mensajeSolicitudCreada', () => {
  it('should_explain_delivery_without_transfer_for_branch_sales', () => {
    expect(mensajeSolicitudCreada(true, true)).toContain('lista para entregar');
    expect(mensajeSolicitudCreada(false, true)).toContain('al aprobarla el Jefe de Local');
  });

  it('should_keep_previous_messages_for_requests_with_transfer', () => {
    expect(mensajeSolicitudCreada(true, false)).toBe('Solicitud creada y aprobada automáticamente.');
    expect(mensajeSolicitudCreada(false, false)).toBe('Solicitud creada. Pendiente de aprobación por el Jefe de Local.');
  });
});

describe('mensajeSolicitudAprobada', () => {
  it('should_say_ready_for_delivery_only_without_transfer', () => {
    expect(mensajeSolicitudAprobada(true)).toContain('lista para entregar');
    expect(mensajeSolicitudAprobada(false)).toBe('Solicitud aprobada exitosamente.');
  });
});
