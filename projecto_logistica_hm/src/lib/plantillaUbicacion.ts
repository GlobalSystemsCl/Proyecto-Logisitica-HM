import type { Workbook } from 'exceljs';
import { codigoVisibleSucursal } from '@/lib/busqueda';
import { crearLibroExcel } from '@/lib/excel';
import { esChasisValido, normalizarEncabezado } from '@/lib/importStock';
import { esSucursalActiva } from '@/lib/sucursalActiva';
import { esSeleccionableParaMover } from '@/lib/ubicacionMasiva';

/**
 * Cambio de ubicación masivo con Excel (2026-11-23). Se descarga una
 * plantilla con los vehículos sin ubicación (solo VIN y Ubicación), se
 * completa la columna Ubicación y se vuelve a subir: solo se actualizan los
 * vehículos de las filas con ubicación, buscados por su VIN.
 */

export const COLUMNA_VIN = 'VIN';
export const COLUMNA_UBICACION = 'Ubicación';
export const HOJA_PLANTILLA = 'Ubicaciones';
export const HOJA_SUCURSALES = 'Sucursales';
/** Filas que se aceptan por carga (el inventario completo cabe de sobra). */
export const MAX_FILAS_PLANTILLA_UBICACION = 3000;

const ALIAS_VIN = ['vin', 'chasis', 'n° chasis', 'nro chasis'];
const ALIAS_UBICACION = ['ubicacion', 'sucursal'];

export interface SucursalPlantilla {
  id: number;
  codigo?: string | null;
  nombre: string | null;
  activa?: boolean | null;
}

export interface FilaPlantillaUbicacion {
  /** Número de fila en el Excel (la 1 son los títulos). */
  fila: number;
  vin: string;
  ubicacion: string;
}

export interface ErrorFilaUbicacion {
  fila: number;
  vin: string;
  motivo: string;
}

export interface AnalisisPlantillaUbicacion {
  /** Vehículos a mover, agrupados por sucursal de destino. */
  grupos: Array<{ sucursalId: number; vins: string[] }>;
  /** Filas con la ubicación vacía: no se tocan. */
  sinUbicacion: number;
  errores: ErrorFilaUbicacion[];
}

/** Vehículos que van en la plantilla: sin ubicación y libres (no reservados ni en camino), por VIN. */
export function vehiculosParaPlantillaUbicacion<
  T extends { chasis: string; ubicacion: number | null; estado_disponibilidad: string; en_transito_hacia?: string | null },
>(vehiculos: T[]): T[] {
  return vehiculos
    .filter((v) => v.ubicacion == null && esSeleccionableParaMover(v))
    .sort((a, b) => a.chasis.localeCompare(b.chasis));
}

/** Texto de cada opción de la lista desplegable: "120B · TORQUEMADA ACOPIO". */
export function opcionUbicacion(s: SucursalPlantilla): string {
  const nombre = (s.nombre ?? '').trim();
  return nombre ? `${codigoVisibleSucursal(s)} · ${nombre}` : codigoVisibleSucursal(s);
}

/**
 * Código de sucursal al inicio de la celda: "120B · TORQUEMADA…" → "120B",
 * "101" → "101". `null` si no empieza con un código.
 */
export function codigoDesdeUbicacion(texto: string): string | null {
  const m = /^\s*(\d+[A-Za-z]?)(?=$|[\s·\-–,.])/.exec(texto ?? '');
  return m ? m[1].toUpperCase() : null;
}

/** Sucursal de un código: primero el código visible exacto ("119B"); si es solo número, el id. */
export function sucursalPorCodigo<T extends SucursalPlantilla>(sucursales: T[], codigo: string): T | null {
  const c = codigo.toUpperCase();
  const exacta = sucursales.find((s) => codigoVisibleSucursal(s).toUpperCase() === c);
  if (exacta) return exacta;
  if (/^\d+$/.test(c)) return sucursales.find((s) => s.id === Number(c)) ?? null;
  return null;
}

/**
 * Lee la hoja (filas como las entrega SheetJS con `header: 1`): busca las
 * columnas VIN y Ubicación en la primera fila.
 */
export function leerPlantillaUbicacion(
  matriz: unknown[][],
): { filas: FilaPlantillaUbicacion[]; error?: undefined } | { filas?: undefined; error: string } {
  const encabezados = (matriz[0] ?? []).map((c) => normalizarEncabezado(String(c ?? '')));
  const iVin = encabezados.findIndex((h) => ALIAS_VIN.includes(h));
  const iUbicacion = encabezados.findIndex((h) => ALIAS_UBICACION.includes(h));
  if (iVin < 0 || iUbicacion < 0) {
    return { error: 'El archivo debe tener las columnas VIN y Ubicación. Usa la plantilla descargada.' };
  }
  const filas: FilaPlantillaUbicacion[] = [];
  matriz.slice(1).forEach((fila, i) => {
    const vin = String(fila?.[iVin] ?? '').trim().toUpperCase();
    const ubicacion = String(fila?.[iUbicacion] ?? '').trim();
    if (!vin && !ubicacion) return;
    filas.push({ fila: i + 2, vin, ubicacion });
  });
  if (filas.length === 0) return { error: 'El archivo no tiene vehículos.' };
  if (filas.length > MAX_FILAS_PLANTILLA_UBICACION) {
    return { error: `El archivo tiene ${filas.length} filas; el máximo es ${MAX_FILAS_PLANTILLA_UBICACION}.` };
  }
  return { filas };
}

/**
 * Valida cada fila y agrupa los VIN por sucursal de destino. Las filas sin
 * ubicación se cuentan y no se tocan. Error por fila: VIN no válido o
 * repetido, ubicación desconocida o sucursal desactivada.
 */
export function analizarPlantillaUbicacion(
  filas: FilaPlantillaUbicacion[],
  sucursales: SucursalPlantilla[],
): AnalisisPlantillaUbicacion {
  const porSucursal = new Map<number, string[]>();
  const vistos = new Set<string>();
  const errores: ErrorFilaUbicacion[] = [];
  let sinUbicacion = 0;

  for (const f of filas) {
    if (!f.ubicacion) {
      sinUbicacion++;
      continue;
    }
    if (!esChasisValido(f.vin)) {
      errores.push({ fila: f.fila, vin: f.vin, motivo: 'VIN no válido (debe tener 17 caracteres).' });
      continue;
    }
    if (vistos.has(f.vin)) {
      errores.push({ fila: f.fila, vin: f.vin, motivo: 'VIN repetido en el archivo.' });
      continue;
    }
    vistos.add(f.vin);
    const codigo = codigoDesdeUbicacion(f.ubicacion);
    const sucursal = codigo ? sucursalPorCodigo(sucursales, codigo) : null;
    if (!sucursal) {
      errores.push({ fila: f.fila, vin: f.vin, motivo: `Ubicación desconocida: "${f.ubicacion}". Elígela de la lista.` });
      continue;
    }
    if (!esSucursalActiva(sucursal)) {
      errores.push({ fila: f.fila, vin: f.vin, motivo: `La sucursal ${codigoVisibleSucursal(sucursal)} está desactivada.` });
      continue;
    }
    const vins = porSucursal.get(sucursal.id) ?? [];
    vins.push(f.vin);
    porSucursal.set(sucursal.id, vins);
  }

  return {
    grupos: [...porSucursal.entries()].map(([sucursalId, vins]) => ({ sucursalId, vins })),
    sinUbicacion,
    errores,
  };
}

/** Resumen de la carga para mostrar al usuario. */
export function resumenCargaUbicaciones(r: { movidos: number; noActualizados: number; sinUbicacion: number }): string {
  const partes = [`${r.movidos} vehículo(s) cambiaron de ubicación.`];
  if (r.noActualizados > 0) partes.push(`${r.noActualizados} no se actualizaron (ver detalle).`);
  if (r.sinUbicacion > 0) partes.push(`${r.sinUbicacion} fila(s) sin ubicación quedaron igual.`);
  return partes.join(' ');
}

/**
 * Plantilla: hoja "Ubicaciones" (VIN y Ubicación, con lista desplegable de
 * sucursales activas) y hoja "Sucursales" con esas opciones. Sin encabezado
 * de exportación: se vuelve a subir tal cual.
 */
export async function crearPlantillaUbicaciones(
  vehiculos: Array<{ chasis: string }>,
  sucursales: SucursalPlantilla[],
): Promise<Workbook> {
  const opciones = sucursales.filter(esSucursalActiva).map(opcionUbicacion);
  const libro = await crearLibroExcel(
    [
      {
        nombre: HOJA_PLANTILLA,
        filas: vehiculos.map((v) => ({ [COLUMNA_VIN]: v.chasis, [COLUMNA_UBICACION]: '' })),
        encabezados: [COLUMNA_VIN, COLUMNA_UBICACION],
      },
      { nombre: HOJA_SUCURSALES, filas: opciones.map((o) => ({ [COLUMNA_UBICACION]: o })), encabezados: [COLUMNA_UBICACION] },
    ],
    null,
  );
  const hoja = libro.getWorksheet(HOJA_PLANTILLA)!;
  hoja.getColumn(2).width = Math.max(30, ...opciones.map((o) => o.length + 2));
  if (opciones.length > 0) {
    const rango = `${HOJA_SUCURSALES}!$A$2:$A$${opciones.length + 1}`;
    for (let fila = 2; fila <= vehiculos.length + 1; fila++) {
      hoja.getCell(fila, 2).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [rango],
        showErrorMessage: true,
        errorTitle: 'Ubicación',
        error: 'Elige una sucursal de la lista.',
      };
    }
  }
  return libro;
}
