import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import { codigoSolicitud, codigoTraslado } from '@/lib/codigoSolicitud';
import { diaChile } from '@/lib/reporteTraslados';
import { formatFecha } from '@/lib/fechas';
import { formatearPatente, normalizarPatente } from '@/lib/patente';
import { formatearRut } from '@/lib/rut';

/**
 * R5 y R4 (2026-11-11): vehículos en tránsito. Sin estados intermedios
 * (decisión del 2026-11-03): un vehículo va en camino desde que se despacha
 * hasta que se recepciona. Una fila por vehículo. Funciones puras.
 */

export interface FilaTransito {
  /** Clave única (traslado + vehículo). */
  clave: string;
  tipo: 'solicitud' | 'interno';
  /** Id de la solicitud o del traslado (para abrir su detalle). */
  entidadId: string;
  codigo: string;
  origen: string;
  destino: string;
  chasis: string;
  vehiculo: string;
  guia: string | null;
  patenteCamion: string | null;
  transportista: string | null;
  empresa: string | null;
  empresaRut: string | null;
  /** Día del despacho en hora de Chile, `YYYY-MM-DD`. */
  fechaDespacho: string | null;
  /** Días completos desde el despacho hasta hoy. */
  dias: number | null;
  /** Fecha límite propuesta (solo solicitudes). */
  fechaLimite: string | null;
  /** Ya pasó la fecha límite y todavía no se recepciona. */
  atrasado: boolean;
}

/** Días entre dos fechas `YYYY-MM-DD` (b - a); null si falta alguna. */
export function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : null;
}

/** Filas en tránsito de solicitudes y traslados internos, primero los que llevan más días. */
export function filasEnTransito(solicitudes: SolicitudLista[], traslados: TrasladoInterno[], hoy: string): FilaTransito[] {
  const deSolicitudes = solicitudes
    .filter((s) => s.estado === 'en_transito')
    .flatMap((s) => {
      const fechaDespacho = diaChile(s.fecha_despacho);
      const fechaLimite = diaChile(s.fecha_limite);
      return s.vehiculos.map<FilaTransito>((v) => ({
        clave: `${s.id}:${v.solicitud_vehiculo_id}`,
        tipo: 'solicitud',
        entidadId: s.id,
        codigo: codigoSolicitud(s),
        origen: s.sucursal_nombre ?? '',
        destino: s.sucursal_destino_nombre ?? s.titulo_evento ?? '',
        chasis: v.chasis,
        vehiculo: `${v.marca} ${v.modelo}`.trim(),
        guia: v.numero_guia ?? null,
        patenteCamion: s.patente_camion ?? null,
        transportista: s.conductor_nombre ?? null,
        empresa: s.transportista?.nombre ?? null,
        empresaRut: s.transportista?.rut ?? null,
        fechaDespacho,
        dias: diasEntre(fechaDespacho, hoy),
        fechaLimite,
        atrasado: !!fechaLimite && fechaLimite < hoy,
      }));
    });
  const deTraslados = traslados
    .filter((t) => t.estado === 'en_transito')
    .flatMap((t) => {
      const fechaDespacho = diaChile(t.fecha_despacho);
      return t.vehiculos.map<FilaTransito>((v) => ({
        clave: `${t.id}:${v.traslado_vehiculo_id}`,
        tipo: 'interno',
        entidadId: t.id,
        codigo: codigoTraslado(t.id),
        origen: t.origen_nombre ?? '',
        destino: t.destino_nombre ?? '',
        chasis: v.chasis,
        vehiculo: `${v.marca} ${v.modelo}`.trim(),
        guia: v.numero_guia ?? null,
        patenteCamion: t.patente_camion ?? null,
        transportista: t.conductor_nombre ?? null,
        empresa: t.transportista?.nombre ?? null,
        empresaRut: t.transportista?.rut ?? null,
        fechaDespacho,
        dias: diasEntre(fechaDespacho, hoy),
        fechaLimite: null,
        atrasado: false,
      }));
    });
  return [...deSolicitudes, ...deTraslados].sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || a.codigo.localeCompare(b.codigo));
}

/** Búsqueda por chasis, guía, código, patente del camión o RUT de la empresa. */
export function coincideFilaTransito(f: FilaTransito, busqueda: string): boolean {
  const texto = busqueda.trim().toLowerCase();
  if (!texto) return true;
  const patente = normalizarPatente(texto);
  const rut = texto.replace(/[^0-9k]/g, '');
  return (
    f.chasis.toLowerCase().includes(texto) ||
    (f.guia ?? '').toLowerCase().includes(texto) ||
    f.codigo.toLowerCase().includes(texto) ||
    (patente.length >= 2 && (f.patenteCamion ?? '').includes(patente)) ||
    (rut.length >= 3 && (f.empresaRut ?? '').toLowerCase().replace(/[^0-9k]/g, '').includes(rut))
  );
}

/** Filas del Excel (mismas columnas que la tabla). */
export function filasExcelTransito(filas: FilaTransito[]): Array<Record<string, string>> {
  return filas.map((f) => ({
    Tipo: f.tipo === 'solicitud' ? 'Solicitud' : 'Traslado interno',
    Código: f.codigo,
    Origen: f.origen,
    Destino: f.destino,
    Chasis: f.chasis,
    Vehículo: f.vehiculo,
    'N° guía': f.guia ?? '',
    'Patente camión': f.patenteCamion ? formatearPatente(f.patenteCamion) : '',
    Transportista: f.transportista ?? '',
    'Empresa de transporte': f.empresa ?? '',
    'RUT empresa': f.empresaRut ? formatearRut(f.empresaRut) : '',
    'Fecha despacho': f.fechaDespacho ? formatFecha(f.fechaDespacho) : '',
    'Días en camino': f.dias === null ? '' : String(f.dias),
    'Fecha límite': f.fechaLimite ? formatFecha(f.fechaLimite) : '',
    Atrasado: f.atrasado ? 'Sí' : 'No',
  }));
}
