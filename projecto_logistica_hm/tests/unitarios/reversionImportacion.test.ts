import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmacionReversionValida,
  mensajeErrorReversion,
  motivoNoRevertible,
  textoResultadoReversion,
} from '@/lib/reversionImportacion';

beforeEach(() => {
  vi.clearAllMocks();
});

const IMP = { revertida_at: null, vehiculos_actuales: 5, usuario_id: 'log-1' };

describe('confirmacionReversionValida', () => {
  it('should_accept_CONFIRMAR_ignoring_case_and_outer_spaces', () => {
    expect(confirmacionReversionValida('CONFIRMAR')).toBe(true);
    expect(confirmacionReversionValida('  confirmar ')).toBe(true);
  });

  it('should_reject_other_text_or_empty', () => {
    expect(confirmacionReversionValida('CONFIRMA')).toBe(false);
    expect(confirmacionReversionValida('')).toBe(false);
    expect(confirmacionReversionValida(null)).toBe(false);
    expect(confirmacionReversionValida('CON FIRMAR')).toBe(false);
  });
});

describe('motivoNoRevertible', () => {
  it('should_allow_admin_to_revert_any_import', () => {
    expect(motivoNoRevertible(IMP, { id: 'adm-1', rol: 'administrador' })).toBeNull();
  });

  it('should_allow_logistica_only_its_own_imports', () => {
    expect(motivoNoRevertible(IMP, { id: 'log-1', rol: 'logistica' })).toBeNull();
    expect(motivoNoRevertible(IMP, { id: 'log-2', rol: 'logistica' })).toBe(
      'Solo el administrador puede revertir importaciones de otro usuario.'
    );
  });

  it('should_reject_other_roles', () => {
    expect(motivoNoRevertible(IMP, { id: 'jl-1', rol: 'jefe_local' })).toBe('No tienes permisos para revertir importaciones.');
  });

  it('should_reject_when_already_reverted', () => {
    expect(motivoNoRevertible({ ...IMP, revertida_at: '2026-11-20T10:00:00Z' }, { id: 'adm-1', rol: 'administrador' })).toBe(
      'Esta importación ya se revirtió.'
    );
  });

  it('should_reject_when_no_vehicles_remain', () => {
    expect(motivoNoRevertible({ ...IMP, vehiculos_actuales: 0 }, { id: 'adm-1', rol: 'administrador' })).toBe(
      'No quedan vehículos de esta importación en el inventario.'
    );
  });
});

describe('mensajeErrorReversion', () => {
  it('should_map_database_codes_to_user_messages', () => {
    expect(mensajeErrorReversion('IMPORTACION_YA_REVERTIDA')).toBe('Esta importación ya se revirtió.');
    expect(mensajeErrorReversion('error: IMPORTACION_NO_EXISTE')).toBe('La importación no existe.');
  });

  it('should_return_generic_message_when_unknown_or_missing', () => {
    expect(mensajeErrorReversion('violates foreign key constraint')).toBe('No se pudo revertir la importación. Intenta de nuevo.');
    expect(mensajeErrorReversion(undefined)).toBe('No se pudo revertir la importación. Intenta de nuevo.');
  });
});

describe('textoResultadoReversion', () => {
  it('should_report_only_deleted_when_nothing_was_kept', () => {
    expect(textoResultadoReversion(12, 0)).toBe('Importación revertida: 12 vehículo(s) eliminado(s) del inventario.');
  });

  it('should_explain_kept_vehicles_when_some_are_in_use', () => {
    expect(textoResultadoReversion(10, 2)).toBe(
      'Importación revertida: 10 vehículo(s) eliminado(s) del inventario. 2 se conservaron porque ya se usan en una solicitud o un traslado.'
    );
  });
});
