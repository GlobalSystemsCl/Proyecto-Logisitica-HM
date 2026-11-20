import { formatearPatente, normalizarPatente, validarPatente } from '@/lib/patente';
import { formatearRut } from '@/lib/rut';
import { plano } from '@/lib/busqueda';
import type { Camion, EmpresaTransporte, TransportistaResumen } from '@/types/transportista.types';

/**
 * Búsqueda de empresas de transporte (R10): por nombre de la empresa, RUT
 * (con o sin puntos ni guion), patente (con o sin guion) o transportista.
 * Funciones puras.
 */
export function coincideEmpresa(empresa: EmpresaTransporte, busqueda: string): boolean {
  const texto = busqueda.trim().toLowerCase();
  if (!texto) return true;
  const soloRut = texto.replace(/[^0-9k]/g, '');
  const soloPatente = normalizarPatente(texto);
  if (empresa.nombre.toLowerCase().includes(texto)) return true;
  if (soloRut.length >= 3 && empresa.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(soloRut)) return true;
  return empresa.camiones.some(
    (c) =>
      (soloPatente.length >= 2 && c.patente.includes(soloPatente)) ||
      (c.conductor_nombre ?? '').toLowerCase().includes(texto)
  );
}

/** Máximo de camiones sugeridos al buscar en el selector. */
export const MAX_SUGERENCIAS_CAMION = 8;

/**
 * Camiones (con su empresa) para el buscador del selector de transporte: por
 * patente (con o sin guion), nombre de la empresa, RUT (con o sin puntos ni
 * guion) o transportista habitual. Sin texto, los primeros de la lista.
 */
export function filtrarCamiones(
  empresas: EmpresaTransporte[],
  busqueda: string,
  max = MAX_SUGERENCIAS_CAMION
): Array<{ empresa: EmpresaTransporte; camion: Camion }> {
  const texto = plano(busqueda);
  const soloRut = texto.replace(/[^0-9k]/g, '');
  const soloPatente = normalizarPatente(busqueda);
  const resultado: Array<{ empresa: EmpresaTransporte; camion: Camion }> = [];
  for (const empresa of empresas) {
    const coincideLaEmpresa =
      !texto ||
      plano(empresa.nombre).includes(texto) ||
      (soloRut.length >= 3 && empresa.rut.toLowerCase().replace(/[^0-9k]/g, '').includes(soloRut));
    for (const camion of empresa.camiones) {
      const coincide =
        coincideLaEmpresa ||
        (soloPatente.length >= 2 && camion.patente.includes(soloPatente)) ||
        plano(camion.conductor_nombre ?? '').includes(texto);
      if (coincide) resultado.push({ empresa, camion });
      if (resultado.length >= max) return resultado;
    }
  }
  return resultado;
}

/** Empresas que coinciden con la búsqueda; con `soloActivas`, oculta las inactivas. */
export function filtrarEmpresas(empresas: EmpresaTransporte[], busqueda: string, soloActivas = false): EmpresaTransporte[] {
  return empresas.filter((e) => (!soloActivas || e.activo) && coincideEmpresa(e, busqueda));
}

/** Empresas activas con sus camiones activos: lo que se ofrece al programar. */
export function empresasParaProgramar(empresas: EmpresaTransporte[]): EmpresaTransporte[] {
  return empresas.filter((e) => e.activo).map((e) => ({ ...e, camiones: e.camiones.filter((c) => c.activo) }));
}

/** Camión (y su empresa) por patente, con o sin guion; null si no está. */
export function buscarCamion(
  empresas: EmpresaTransporte[],
  patente: string
): { empresa: EmpresaTransporte; camion: Camion } | null {
  const p = normalizarPatente(patente);
  if (!p) return null;
  for (const empresa of empresas) {
    const camion = empresa.camiones.find((c) => c.patente === p);
    if (camion) return { empresa, camion };
  }
  return null;
}

/**
 * Texto del transporte de un traslado: "ABCD-12 · Pedro Soto · Transportes Sur
 * (76.543.210-3)". Lo programado antes del 2026-11-11 solo tiene la empresa.
 */
export function textoTransporte(d: {
  transportista: TransportistaResumen | null;
  patente_camion?: string | null;
  conductor_nombre?: string | null;
}): string {
  const empresa = d.transportista ? `${d.transportista.nombre} (${formatearRut(d.transportista.rut)})` : '';
  return [d.patente_camion ? formatearPatente(d.patente_camion) : '', d.conductor_nombre ?? '', empresa]
    .filter(Boolean)
    .join(' · ');
}

/** Para los filtros "RUT o patente": coincide con la patente o el RUT de la empresa. */
export function coincideTransporte(
  d: { transportista: TransportistaResumen | null; patente_camion?: string | null },
  busqueda: string
): boolean {
  const texto = busqueda.trim();
  if (!texto) return true;
  const patente = normalizarPatente(texto);
  const rut = texto.toLowerCase().replace(/[^0-9k]/g, '');
  if (patente.length >= 2 && (d.patente_camion ?? '').includes(patente)) return true;
  return rut.length >= 3 && (d.transportista?.rut ?? '').toLowerCase().replace(/[^0-9k]/g, '').includes(rut);
}

/**
 * Error del formulario de transporte antes de enviarlo, o null si está
 * completo: patente registrada (activa) y transportista indicado.
 */
export function errorAsignacionTransporte(
  empresas: EmpresaTransporte[],
  valor: { patente: string; conductorNombre: string | null } | null
): string | null {
  if (!valor?.patente.trim()) return 'Indica la patente del camión.';
  if (!buscarCamion(empresas, valor.patente)) {
    // Lo escrito no es una patente (se buscó por empresa o RUT): falta elegir el camión.
    if (validarPatente(valor.patente)) return 'Elige el camión de la lista: búscalo por patente, empresa o RUT.';
    return 'La patente no está registrada: regístrala con su empresa antes de continuar.';
  }
  if (!valor.conductorNombre?.trim()) return 'Indica el nombre del transportista que maneja el camión.';
  return null;
}
