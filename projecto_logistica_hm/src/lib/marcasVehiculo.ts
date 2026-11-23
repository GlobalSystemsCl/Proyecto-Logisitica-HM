import { plano } from '@/lib/busqueda';

/**
 * Marca y modelo en el alta manual de vehículos (2026-11-23): la marca se
 * elige del catálogo (`marca`: código "HY" + nombre "HYUNDAI") o se crea ahí
 * mismo; el modelo sugiere los que ya existen para esa marca.
 */

export interface MarcaCatalogo {
  id?: number;
  codigo: string;
  nombre: string;
}

/** Marcas cuyo código empieza con el texto o cuyo nombre lo contiene (sin tildes ni mayúsculas). */
export function filtrarMarcas<T extends MarcaCatalogo>(marcas: T[], texto: string): T[] {
  const t = plano(texto);
  if (!t) return marcas;
  return marcas.filter((m) => plano(m.codigo).startsWith(t) || plano(m.nombre).includes(t));
}

/** ¿Ya hay una marca con ese código o ese nombre exacto? (para no ofrecer crearla). */
export function existeMarca(marcas: MarcaCatalogo[], texto: string): boolean {
  const t = plano(texto);
  if (!t) return false;
  return marcas.some((m) => plano(m.codigo) === t || plano(m.nombre) === t);
}

/**
 * Código y nombre que se proponen al crear una marca desde lo que se escribió:
 * un texto corto sin espacios ("KIA", "BYD") sirve de código y de nombre; uno
 * largo solo de nombre.
 */
export function propuestaMarcaNueva(texto: string): MarcaCatalogo {
  const limpio = texto.trim().toUpperCase().replace(/\s+/g, ' ');
  const esCodigo = /^[A-Z0-9]{1,4}$/.test(limpio);
  return { codigo: esCodigo ? limpio : '', nombre: limpio };
}

/** Error de la marca nueva, o `null` si se puede crear. */
export function validarMarcaNueva(m: MarcaCatalogo): string | null {
  const codigo = m.codigo.trim();
  if (!codigo) return 'Indica el código de la marca (ej. HY).';
  if (!/^[A-Za-z0-9]{1,10}$/.test(codigo)) return 'El código lleva solo letras y números (hasta 10).';
  if (!m.nombre.trim()) return 'Indica el nombre de la marca (ej. HYUNDAI).';
  return null;
}

/** Modelos ya registrados de una marca (por nombre o código), sin repetir y ordenados. */
export function modelosDeMarca(
  vehiculos: Array<{ marca: string | null; marca_codigo?: string | null; modelo: string | null }>,
  marca: { nombre: string; codigo?: string | null },
): string[] {
  const nombre = plano(marca.nombre);
  const codigo = plano(marca.codigo ?? '');
  if (!nombre && !codigo) return [];
  const modelos = new Map<string, string>();
  for (const v of vehiculos) {
    const mismaMarca = (nombre && plano(v.marca ?? '') === nombre) || (codigo && plano(v.marca_codigo ?? '') === codigo);
    const modelo = (v.modelo ?? '').trim();
    if (mismaMarca && modelo && !modelos.has(plano(modelo))) modelos.set(plano(modelo), modelo);
  }
  return [...modelos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
