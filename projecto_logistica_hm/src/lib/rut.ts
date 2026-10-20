/**
 * RUT chileno (transportistas). Se guarda normalizado, sin puntos y con
 * guion: `12345678-9` o `12345678-K` (mismo formato que exige la BD).
 */

/** Quita puntos, guiones y espacios, y pasa la K a mayúscula: "12.345.678-k" → "12345678K". */
function limpiarRut(rut: string): string {
  return (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/** Dígito verificador (módulo 11) del cuerpo numérico del RUT. */
export function calcularDigitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

/**
 * RUT en el formato de la BD (`12345678-9`), o `null` si no es válido: cuerpo
 * de 7 u 8 dígitos y dígito verificador correcto.
 */
export function normalizarRut(rut: string): string | null {
  const limpio = limpiarRut(rut);
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^[0-9]{7,8}$/.test(cuerpo) || !/^[0-9K]$/.test(dv)) return null;
  if (calcularDigitoVerificador(cuerpo) !== dv) return null;
  return `${cuerpo}-${dv}`;
}

export function validarRut(rut: string): boolean {
  return normalizarRut(rut) !== null;
}

/** Para mostrar: "12.345.678-9". Si no es válido, devuelve el texto tal cual. */
export function formatearRut(rut: string): string {
  const normal = normalizarRut(rut);
  if (!normal) return rut;
  const [cuerpo, dv] = normal.split('-');
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}
