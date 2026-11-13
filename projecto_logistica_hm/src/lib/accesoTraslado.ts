/**
 * QA #49: quién puede ver (y adjuntar) documentos de un traslado interno.
 * Misma regla que las listas de traslados:
 *   - administrador: todos
 *   - el usuario de Logística asignado
 *   - Logística o jefe de local cuyo alcance (zonas o sucursales a cargo)
 *     incluye el origen o el destino
 * Función pura: el alcance lo resuelve quien llama.
 */
export function puedeAccederTraslado(
  rol: string,
  usuarioId: string,
  traslado: { logistica_id: string | null; origen_id: number; destino_id: number },
  sucursalesAlcance: number[],
): boolean {
  if (rol === 'administrador') return true;
  if (traslado.logistica_id && traslado.logistica_id === usuarioId) return true;
  if (rol !== 'logistica' && rol !== 'jefe_local') return false;
  return sucursalesAlcance.includes(traslado.origen_id) || sucursalesAlcance.includes(traslado.destino_id);
}
