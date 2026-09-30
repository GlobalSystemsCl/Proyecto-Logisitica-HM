import Link from 'next/link';
import { AlertCircle, ArrowRight, Flag, ListOrdered } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import { formatFecha } from '@/lib/fechas';

/** Máximo de solicitudes que se listan antes de remitir a la cola completa. */
export const MAX_FILAS_PRIORIDADES = 8;

/** Posiciones consideradas urgentes en el resumen del dashboard. */
export const UMBRAL_URGENTE = 2;

interface GrupoSucursal {
  sucursal: number;
  nombre: string;
  filas: SolicitudLista[];
}

interface ResumenPrioridades {
  grupos: GrupoSucursal[];
  total: number;
  urgentes: number;
  porAprobar: number;
}

const ESTADO_LABEL: Record<string, string> = {
  priorizada: 'Priorizada',
};

/**
 * Agrupa la cola por sucursal de origen y ordena cada grupo por posición de
 * prioridad. Función pura, exportada para poder probarla sin renderizar.
 */
export function agruparPorSucursal(
  solicitudes: SolicitudLista[],
  porAprobar = 0
): ResumenPrioridades {
  const cola = [...solicitudes]
    .filter((s) => s.posicion_prioridad !== null)
    .sort((a, b) => (a.posicion_prioridad ?? 0) - (b.posicion_prioridad ?? 0));

  const porClave = new Map<number, GrupoSucursal>();
  for (const sol of cola) {
    const clave = sol.sucursal;
    if (!porClave.has(clave)) {
      porClave.set(clave, {
        sucursal: clave,
        nombre: sol.sucursal_nombre || `Sucursal #${clave}`,
        filas: [],
      });
    }
    porClave.get(clave)!.filas.push(sol);
  }

  return {
    grupos: [...porClave.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    total: cola.length,
    urgentes: cola.filter((s) => (s.posicion_prioridad ?? 99) <= UMBRAL_URGENTE).length,
    porAprobar,
  };
}

/**
 * Identificadores de las primeras `limite` filas de la cola, en el orden en que
 * se muestran. El resto se resume en una única fila "más solicitudes".
 */
export function seleccionarVisibles(grupos: GrupoSucursal[], limite: number): Set<string> {
  const visibles = new Set<string>();
  if (limite <= 0) return visibles;

  for (const grupo of grupos) {
    for (const fila of grupo.filas) {
      if (visibles.size >= limite) return visibles;
      visibles.add(fila.id);
    }
  }
  return visibles;
}

function prioridadVisual(posicion: number | null): string {
  if (posicion === null) return 'bg-neutral-200 text-neutral-600';
  if (posicion <= UMBRAL_URGENTE) return 'bg-red-600 text-white';
  if (posicion <= 5) return 'bg-amber-500 text-white';
  return 'bg-neutral-900 text-white';
}

/**
 * Resumen de la cola de prioridad del jefe de local: qué es urgente ahora.
 * Es de solo lectura; priorizar, reordenar o sacar de la cola sigue siendo
 * acción de `/solicitudes/prioridades`.
 */
export default function DashboardPrioridades({
  solicitudes,
  porAprobar = 0,
}: {
  solicitudes: SolicitudLista[];
  porAprobar?: number;
}) {
  const { grupos, total, urgentes, porAprobar: pendientes } = agruparPorSucursal(
    solicitudes,
    porAprobar
  );
  const visibles = seleccionarVisibles(grupos, MAX_FILAS_PRIORIDADES);

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-xl font-bold text-[#1a2b4b] flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-[#1a2b4b]" />
          Prioridades
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          {pendientes > 0
            ? `No hay solicitudes priorizadas, pero tienes ${pendientes} pendiente${
                pendientes === 1 ? '' : 's'
              } de aprobar.`
            : 'No hay solicitudes priorizadas en tus sucursales.'}
        </p>
        {pendientes > 0 && (
          <Link
            href="/solicitudes/aprobaciones"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a2b4b] hover:underline"
          >
            Ir a Aprobaciones <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="dashboard-prioridades"
      className="rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2
            id="dashboard-prioridades"
            className="text-xl font-bold text-[#1a2b4b] flex items-center gap-2"
          >
            <ListOrdered className="w-5 h-5 text-[#1a2b4b]" />
            Prioridades
          </h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            La posición 1 es lo más urgente de la sucursal
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Indicador etiqueta="En cola" valor={total} />
          <Indicador
            etiqueta="Urgentes"
            valor={urgentes}
            destacado={urgentes > 0}
          />
          <Indicador etiqueta="Por aprobar" valor={pendientes} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grupos.map((grupo) => (
          <div key={grupo.sucursal}>
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              {grupo.nombre}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {grupo.filas.map((sol) => {
                const visible = visibles.has(sol.id);
                const destino =
                  sol.tipo_solicitud === 'venta'
                    ? sol.sucursal_destino_nombre || `#${sol.sucursal_destino}`
                    : sol.titulo_evento || sol.direccion_evento || 'Evento';
                const patente = sol.vehiculos[0]?.patente;

                return (
                  <li key={sol.id}>
                    {visible ? (
                      <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold tabular-nums ${prioridadVisual(
                            sol.posicion_prioridad
                          )}`}
                        >
                          {sol.posicion_prioridad}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                            {patente ? (
                              <span className="font-mono">{patente}</span>
                            ) : (
                              <span className="text-neutral-400">Sin vehículo</span>
                            )}
                            <span className="font-sans text-xs font-medium text-neutral-500">
                              → {destino}
                            </span>
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {sol.ejecutivo_nombre ? `Solicita ${sol.ejecutivo_nombre}` : 'Sin solicitante'}
                            {sol.fecha_limite ? ` · Límite ${formatFecha(sol.fecha_limite)}` : ''}
                            {sol.vehiculos.length > 1 ? ` · +${sol.vehiculos.length - 1} vehículo(s)` : ''}
                          </p>
                        </div>
                        <span className="hidden sm:inline-flex shrink-0 rounded-lg border border-neutral-200 bg-white px-2 py-0.5 text-xs font-semibold text-neutral-600">
                          {ESTADO_LABEL[sol.estado] ?? sol.estado}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 px-3 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 text-sm font-bold tabular-nums">
                          +{sol.vehiculos.length}
                        </span>
                        <p className="text-sm text-neutral-500">
                          Más solicitudes en la cola de {grupo.nombre}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <Link
        href="/solicitudes/prioridades"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1a2b4b] hover:underline"
      >
        Ver la cola completa ({total})
        <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  );
}

function Indicador({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${
        destacado ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      {destacado ? (
        <AlertCircle className="w-4 h-4 text-red-600" />
      ) : (
        <Flag className="w-4 h-4 text-neutral-400" />
      )}
      <span className="text-sm font-bold text-neutral-900 tabular-nums">{valor}</span>
      <span className="text-xs text-neutral-500">{etiqueta}</span>
    </div>
  );
}
