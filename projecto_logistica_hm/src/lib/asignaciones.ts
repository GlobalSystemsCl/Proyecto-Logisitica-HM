import type { UserRole } from '@/types/auth.types';

/**
 * Reglas de asignación de sucursales y zonas por rol.
 *
 *  - Ejecutivo: una sola sucursal (su sucursal base, `usuario.sucursal_id`).
 *  - Logística: una sucursal base y una sola zona (`usuario_zona`).
 *  - Jefe de local: una sucursal base y, opcionalmente, sucursales
 *    adicionales. Todas quedan a su cargo en `sucursal.usuario_id`, por eso
 *    una sucursal nunca tiene dos jefes de local.
 *  - Administrador y operaciones: sucursal base opcional, sin sucursales a
 *    cargo ni zonas.
 *
 * Funciones puras: las usan el modal de `/admin/usuarios` y `UsersService`.
 */

/** Roles que deben tener una sucursal base. */
export const ROLES_CON_SUCURSAL_BASE: readonly UserRole[] = ['ejecutivo', 'jefe_local', 'logistica'];

export interface AsignacionesEntrada {
  rol: UserRole;
  sucursal_id?: number | null;
  /** Sucursales adicionales (sin contar la base). */
  sucursales_ids?: number[] | null;
  zonas_ids?: number[] | null;
}

export interface AsignacionesNormalizadas {
  sucursal_id: number | null;
  /** Sucursales a cargo del usuario (`sucursal.usuario_id`): la base incluida, solo para jefes de local. */
  sucursales_a_cargo: number[];
  zonas_ids: number[];
}

export type ResultadoAsignaciones =
  | { ok: true; asignaciones: AsignacionesNormalizadas }
  | { ok: false; error: string };

function idsValidos(ids: number[] | null | undefined): number[] {
  return Array.from(new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0)));
}

/** Valida las asignaciones del rol y descarta las que no le corresponden. */
export function normalizarAsignaciones(entrada: AsignacionesEntrada): ResultadoAsignaciones {
  const base = Number.isInteger(entrada.sucursal_id) && (entrada.sucursal_id as number) > 0
    ? (entrada.sucursal_id as number)
    : null;

  if (ROLES_CON_SUCURSAL_BASE.includes(entrada.rol) && base === null) {
    return { ok: false, error: 'Debes asignar la sucursal base del usuario.' };
  }

  if (entrada.rol === 'logistica') {
    const zonas = idsValidos(entrada.zonas_ids);
    if (zonas.length !== 1) {
      return { ok: false, error: 'Un usuario de Logística debe tener exactamente una zona asignada.' };
    }
    return { ok: true, asignaciones: { sucursal_id: base, sucursales_a_cargo: [], zonas_ids: zonas } };
  }

  if (entrada.rol === 'jefe_local') {
    const adicionales = idsValidos(entrada.sucursales_ids).filter((id) => id !== base);
    return {
      ok: true,
      asignaciones: { sucursal_id: base, sucursales_a_cargo: [base as number, ...adicionales], zonas_ids: [] },
    };
  }

  return { ok: true, asignaciones: { sucursal_id: base, sucursales_a_cargo: [], zonas_ids: [] } };
}

export interface JefeConSucursales {
  id: string;
  nombre: string;
  rol: UserRole;
  sucursal_id?: number | null;
  sucursales?: Array<{ id: number }> | null;
}

/**
 * Sucursales que ya están a cargo de otro jefe de local (su base o sus
 * adicionales), con el nombre de ese jefe. `excluirUsuarioId` es el usuario
 * que se está editando: sus propias sucursales no cuentan como ocupadas.
 */
export function sucursalesOcupadasPorJefes(
  usuarios: JefeConSucursales[],
  excluirUsuarioId?: string | null
): Map<number, string> {
  const ocupadas = new Map<number, string>();
  for (const u of usuarios) {
    if (u.rol !== 'jefe_local' || u.id === excluirUsuarioId) continue;
    const ids = [
      ...(typeof u.sucursal_id === 'number' ? [u.sucursal_id] : []),
      ...(u.sucursales ?? []).map((s) => s.id),
    ];
    for (const id of ids) {
      if (!ocupadas.has(id)) ocupadas.set(id, u.nombre);
    }
  }
  return ocupadas;
}

/**
 * Mensaje de error si alguna de las sucursales ya tiene otro jefe de local,
 * o `null` si todas están libres.
 */
export function conflictoJefeLocal(
  sucursalesACargo: number[],
  ocupadas: Map<number, string>,
  nombreSucursal: (id: number) => string
): string | null {
  const conflictos = sucursalesACargo
    .filter((id) => ocupadas.has(id))
    .map((id) => `${nombreSucursal(id)} (a cargo de ${ocupadas.get(id)})`);
  if (conflictos.length === 0) return null;
  return `Cada sucursal tiene un solo jefe de local. Ya están asignadas: ${conflictos.join(', ')}.`;
}

/**
 * Validación del modal de usuarios antes de enviar: las mismas reglas que
 * aplica el servidor. Devuelve el mensaje de error, o `null` si es válido.
 */
export function validarAsignacionesFormulario(
  entrada: AsignacionesEntrada,
  ocupadas: Map<number, string>,
  sucursales: Array<{ id: number; nombre: string | null }>
): string | null {
  const res = normalizarAsignaciones(entrada);
  if (!res.ok) return res.error;
  return conflictoJefeLocal(
    res.asignaciones.sucursales_a_cargo,
    ocupadas,
    (id) => sucursales.find((s) => s.id === id)?.nombre ?? `Sucursal #${id}`
  );
}
