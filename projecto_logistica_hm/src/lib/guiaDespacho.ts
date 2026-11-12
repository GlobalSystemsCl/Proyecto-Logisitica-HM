/**
 * Número de guía de despacho (R15, pedido del cliente del 2026-11-03).
 *
 * Antes de despachar, Logística ingresa la guía de cada vehículo; sin guía no
 * se despacha. La guía se asocia al chasis y puede repetirse en varios
 * vehículos. Se guarda en `solicitud_vehiculo.numero_guia` y en
 * `traslado_interno_vehiculo.numero_guia`.
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** Debe coincidir con el check de la migración 20261111120000. */
export const MAX_LARGO_GUIA = 40;

/** Guía sin espacios en los extremos y con espacios internos simples. */
export function normalizarGuia(valor: string | null | undefined): string {
  return (valor ?? '').trim().replace(/\s+/g, ' ');
}

export type ResultadoGuias =
  | { ok: true; guias: Record<string, string> }
  | { ok: false; error: string };

/**
 * Valida que cada vínculo (`ids`, de solicitud_vehiculo o
 * traslado_interno_vehiculo) tenga su guía. Devuelve las guías normalizadas,
 * solo de esos ids.
 */
export function validarGuias(ids: string[], guias: Record<string, string | null | undefined>): ResultadoGuias {
  if (ids.length === 0) return { ok: false, error: 'La solicitud no tiene vehículos para despachar.' };
  const resultado: Record<string, string> = {};
  let faltan = 0;
  for (const id of ids) {
    const guia = normalizarGuia(guias[id]);
    if (!guia) {
      faltan += 1;
      continue;
    }
    if (guia.length > MAX_LARGO_GUIA) {
      return { ok: false, error: `El número de guía "${guia.slice(0, 20)}…" supera los ${MAX_LARGO_GUIA} caracteres.` };
    }
    resultado[id] = guia;
  }
  if (faltan > 0) {
    return {
      ok: false,
      error:
        faltan === 1
          ? 'Falta el número de guía de 1 vehículo: no se puede despachar sin guía.'
          : `Falta el número de guía de ${faltan} vehículos: no se puede despachar sin guía.`,
    };
  }
  return { ok: true, guias: resultado };
}

/** Agrupa los ids por guía, para actualizar con una sentencia por guía. */
export function idsPorGuia(guias: Record<string, string>): Map<string, string[]> {
  const grupos = new Map<string, string[]>();
  for (const [id, guia] of Object.entries(guias)) {
    grupos.set(guia, [...(grupos.get(guia) ?? []), id]);
  }
  return grupos;
}

/** Guías distintas de un grupo de vehículos, para mostrar: "1001, 1002" o "". */
export function guiasTexto(vehiculos: Array<{ numero_guia?: string | null }>): string {
  return [...new Set(vehiculos.map((v) => normalizarGuia(v.numero_guia)).filter(Boolean))].join(', ');
}
