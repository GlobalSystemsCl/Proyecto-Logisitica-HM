/**
 * Patente de camión (R10, empresas de transporte). Se guarda normalizada, en
 * mayúsculas y sin guion ni espacios (`ABCD12`), igual que exige la BD
 * (`camion_patente_formato`). Funciones puras.
 */

/** "abcd-12" → "ABCD12". */
export function normalizarPatente(valor: string | null | undefined): string {
  return (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Error para el usuario, o null si la patente normalizada es válida. */
export function validarPatente(valor: string | null | undefined): string | null {
  const p = normalizarPatente(valor);
  if (!p) return 'Indica la patente del camión.';
  if (p.length < 5 || p.length > 8 || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) {
    return 'La patente no es válida: usa letras y números, por ejemplo ABCD-12 o AB-1234.';
  }
  return null;
}

/** Para mostrar: "ABCD12" → "ABCD-12", "AB1234" → "AB-1234"; otras, tal cual. */
export function formatearPatente(valor: string | null | undefined): string {
  const p = normalizarPatente(valor);
  const m = p.match(/^([A-Z]{4})([0-9]{2})$/) ?? p.match(/^([A-Z]{2})([0-9]{4})$/);
  return m ? `${m[1]}-${m[2]}` : p;
}
