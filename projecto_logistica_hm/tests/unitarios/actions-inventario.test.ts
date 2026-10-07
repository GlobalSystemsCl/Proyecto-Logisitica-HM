import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Inventario de Server Actions (brechas 004 y 017).
 *
 * Toda función exportada en src/app/actions es un endpoint POST público. Este
 * test recorre los archivos y falla si una action exportada no invoca un guard
 * de sesión/rol, salvo las del flujo de autenticación, que son públicas por
 * diseño (login, registro, recuperación) y se listan explícitamente.
 */

const DIR = join(process.cwd(), 'src', 'app', 'actions');

const GUARDS = [
  'requireProfile(',
  'verifyAdminPermission(',
  'verifyVehiculoPermission(',
  'getProfileOrThrow(',
];

/** Actions públicas o que validan la sesión dentro de AuthService. */
const PUBLICAS = new Set([
  'auth.actions.ts:registerAction',
  'auth.actions.ts:loginAction',
  'auth.actions.ts:logoutAction',
  'auth.actions.ts:requestPasswordResetAction',
  'auth.actions.ts:updatePasswordAction', // AuthService.updatePassword exige sesión (getUser)
  'auth.actions.ts:updateProfileAction', // AuthService.updateProfile exige sesión (getUser)
]);

interface ActionExportada {
  archivo: string;
  nombre: string;
  cuerpo: string;
}

function extraerActions(): ActionExportada[] {
  const resultado: ActionExportada[] = [];
  for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.ts'))) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8');
    const regex = /export async function (\w+)\s*\(/g;
    const inicios: Array<{ nombre: string; indice: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(fuente))) inicios.push({ nombre: m[1], indice: m.index });
    inicios.forEach((inicio, i) => {
      const fin = i + 1 < inicios.length ? inicios[i + 1].indice : fuente.length;
      resultado.push({ archivo, nombre: inicio.nombre, cuerpo: fuente.slice(inicio.indice, fin) });
    });
  }
  return resultado;
}

describe('Inventario de Server Actions', () => {
  const actions = extraerActions();

  it('should_find_the_action_files', () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it('should_call_a_guard_in_every_non_public_action', () => {
    const sinGuard = actions
      .filter((a) => !PUBLICAS.has(`${a.archivo}:${a.nombre}`))
      .filter((a) => !GUARDS.some((g) => a.cuerpo.includes(g)))
      .map((a) => `${a.archivo}:${a.nombre}`);

    expect(sinGuard).toEqual([]);
  });

  it('should_keep_the_public_allowlist_in_sync_with_existing_actions', () => {
    const existentes = new Set(actions.map((a) => `${a.archivo}:${a.nombre}`));
    const huerfanas = [...PUBLICAS].filter((p) => !existentes.has(p));
    expect(huerfanas).toEqual([]);
  });

  it('should_check_solicitud_scope_in_actions_that_receive_a_solicitud_id', () => {
    // Brechas 004, 006 y 008: si la action recibe un ID de solicitud,
    // documento o reserva, debe verificar el alcance sobre ese objeto.
    const EXCEPCIONES = new Set([
      // Validan la sucursal del jefe local con validarSucursalJefeLocal y el
      // service valida estado; el admin no tiene restricción de alcance.
      'solicitudes.actions.ts:aprobarSolicitudAction',
      'solicitudes.actions.ts:rechazarSolicitudAction',
      'solicitudes.actions.ts:priorizarSolicitudAction',
      'solicitudes.actions.ts:priorizarEnPosicionAction',
      'solicitudes.actions.ts:sacarDeColaAction',
      'solicitudes.actions.ts:eliminarSolicitudAction',
      // Solo devuelve el cooldown del propio usuario (filtra por usuario_id).
      'solicitudes.actions.ts:getCooldownInsistenciaAction',
    ]);
    const guardsAlcance = ['requireSolicitudAccess(', 'requireDocumentoAccess(', 'requireSolicitudVehiculoAccess('];

    const sinAlcance = actions
      .filter((a) => a.archivo === 'solicitudes.actions.ts')
      .filter((a) => /\((?:id|solicitudId|documentoId|solicitudVehiculoId)\s*:/.test(a.cuerpo.split('\n')[0]))
      .filter((a) => !EXCEPCIONES.has(`${a.archivo}:${a.nombre}`))
      .filter((a) => !guardsAlcance.some((g) => a.cuerpo.includes(g)))
      .map((a) => a.nombre);

    expect(sinAlcance).toEqual([]);
  });
});
