import { normalizarPatente } from '@/lib/patente';
import { formatearPatente } from '@/lib/patente';
import { formatearRut } from '@/lib/rut';
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
  if (!buscarCamion(empresas, valor.patente)) return 'La patente no está registrada: regístrala con su empresa antes de continuar.';
  if (!valor.conductorNombre?.trim()) return 'Indica el nombre del transportista que maneja el camión.';
  return null;
}
