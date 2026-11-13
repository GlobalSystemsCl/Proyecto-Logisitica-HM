import type { SolicitudLista } from '@/types/solicitud.types';

/**
 * Priorización por sucursal: cada sucursal tiene su propia cola y su propia
 * lista "Por priorizar". La cola pertenece a la sucursal de origen de la
 * solicitud (la clave única de la BD es `(sucursal, posicion_prioridad)`).
 *
 * Funciones puras: no tocan la BD ni React.
 */

export interface ColaSucursal {
  /** Priorizadas con posición, ordenadas de la más urgente (1) a la menos. */
  cola: SolicitudLista[];
  /** Aprobadas que todavía no entran a la cola. */
  porPriorizar: SolicitudLista[];
}

export interface ResumenSucursalPrioridad {
  id: number;
  nombre: string;
  enCola: number;
  porPriorizar: number;
}

export function colaDeSucursal(solicitudes: SolicitudLista[], sucursalId: number | null): ColaSucursal {
  if (sucursalId === null) return { cola: [], porPriorizar: [] };
  const deLaSucursal = solicitudes.filter((s) => s.sucursal === sucursalId);
  return {
    cola: deLaSucursal
      .filter((s) => s.estado === 'priorizada' && s.posicion_prioridad !== null)
      .sort((a, b) => (a.posicion_prioridad ?? 0) - (b.posicion_prioridad ?? 0)),
    porPriorizar: deLaSucursal.filter((s) => s.estado === 'aprobada' && s.posicion_prioridad === null),
  };
}

/** Contadores por sucursal para las pestañas, en el orden recibido. */
export function resumenPrioridadPorSucursal(
  solicitudes: SolicitudLista[],
  sucursales: Array<{ id: number; nombre: string | null }>
): ResumenSucursalPrioridad[] {
  return sucursales.map((suc) => {
    const { cola, porPriorizar } = colaDeSucursal(solicitudes, suc.id);
    return {
      id: suc.id,
      nombre: suc.nombre?.trim() || `Sucursal ${suc.id}`,
      enCola: cola.length,
      porPriorizar: porPriorizar.length,
    };
  });
}

/**
 * Sucursal que se muestra al entrar: la primera con trabajo pendiente
 * (algo por priorizar o en cola) o, si ninguna tiene, la primera de la lista.
 */
export function sucursalInicial(resumen: ResumenSucursalPrioridad[]): number | null {
  if (resumen.length === 0) return null;
  const conPendientes = resumen.find((r) => r.porPriorizar > 0) ?? resumen.find((r) => r.enCola > 0);
  return (conPendientes ?? resumen[0]).id;
}

/**
 * QA #37: posición (1..N) que ocupa `id` dentro de la cola de su sucursal en
 * el orden local, que puede mezclar sucursales (vista del administrador).
 * Se calcula con la tarjeta ya insertada donde se soltó: se cuentan las de la
 * misma sucursal que quedan antes que ella. Antes se contaba delante de la
 * tarjeta de destino, que incluía a la recién insertada, y quedaba una
 * posición más abajo. `null` si no está en el orden.
 */
export function posicionEnColaSucursal(
  orden: string[],
  id: string,
  sucursalDe: (id: string) => number | null | undefined,
): number | null {
  const indice = orden.indexOf(id);
  if (indice === -1) return null;
  const sucursal = sucursalDe(id);
  let antes = 0;
  for (let i = 0; i < indice; i++) {
    if (sucursalDe(orden[i]) === sucursal) antes++;
  }
  return antes + 1;
}

/**
 * QA #39: orden de "Por programar": primero la posición en la cola de su
 * sucursal (1 antes que 2) y, a igual posición, la fecha límite más próxima.
 * Sin posición ni fecha van al final. No modifica la lista recibida.
 */
export function ordenarPorPrioridad<T extends { posicion_prioridad: number | null; fecha_limite?: string | null }>(
  lista: T[],
): T[] {
  const tiempo = (f: string | null | undefined) => (f ? new Date(f).getTime() : Number.POSITIVE_INFINITY);
  return [...lista].sort(
    (a, b) =>
      (a.posicion_prioridad ?? Infinity) - (b.posicion_prioridad ?? Infinity) ||
      tiempo(a.fecha_limite) - tiempo(b.fecha_limite),
  );
}

/**
 * QA #35: sube (-1) o baja (+1) una solicitud un puesto dentro de la cola de
 * su sucursal, intercambiándola con la vecina de la misma sucursal (la cola
 * local puede mezclar sucursales). Devuelve el nuevo orden, o null si ya está
 * en el borde o no está en la cola.
 */
export function moverEnColaSucursal(
  orden: string[],
  id: string,
  direccion: -1 | 1,
  sucursalDe: (id: string) => number | null | undefined,
): string[] | null {
  const i = orden.indexOf(id);
  if (i === -1) return null;
  const sucursal = sucursalDe(id);
  let j = i + direccion;
  while (j >= 0 && j < orden.length && sucursalDe(orden[j]) !== sucursal) j += direccion;
  if (j < 0 || j >= orden.length) return null;
  const nuevo = [...orden];
  [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
  return nuevo;
}
