'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  AlertCircle,
  X,
  Car,
  Clock,
  ListOrdered,
  Inbox,
  GripVertical,
} from 'lucide-react';
import {
  priorizarSolicitudAction,
  priorizarEnPosicionAction,
  reordenarColaAction,
  sacarDeColaAction,
} from '@/app/actions/solicitudes.actions';
import { SolicitudLista, TipoSolicitud, VehiculoAsociado } from '@/types/solicitud.types';
import { UsuarioSucursalAsignada } from '@/types/auth.types';
import { formatFecha } from '@/lib/fechas';
import { nombreVehiculoConAnio } from '@/lib/vehiculo';
import { UsuarioNombreBoton } from '@/components/usuario-info-modal';
import { colaDeSucursal, resumenPrioridadPorSucursal, sucursalInicial } from '@/lib/prioridades';
import { getEstadoAtraso, BORDE_ATRASO, CHIP_ATRASO } from '../SolicitudesClient';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface PrioridadesClientProps {
  solicitudes: SolicitudLista[];
  /**
   * Sucursales cuya cola puede gestionar el usuario: las del Jefe Local
   * (principal + las que encabeza) o todas, para el administrador.
   */
  sucursalesAsignadas: UsuarioSucursalAsignada[];
}

const tipoLabel: Record<TipoSolicitud, string> = {
  venta: 'Venta',
  evento: 'Evento',
};

// IDs de zonas droppables auxiliares
const ZONA_COLA_VACIA = 'zona-cola-vacia';
const ZONA_POR_PRIORIZAR = 'zona-por-priorizar';

export default function PrioridadesClient({
  solicitudes,
  sucursalesAsignadas,
}: PrioridadesClientProps) {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingOps, setPendingOps] = useState(0);

  // Espejo del estado local para leerlo desde operaciones encoladas.
  const listasRef = useRef<{ orden: string[]; por: string[] }>({ orden: [], por: [] });
  // Serializa las operaciones de persistencia para no chocar contra la clave única
  // (sucursal, posicion_prioridad) ni contra transiciones de estado inválidas.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const lastSyncRef = useRef<{ c: string; p: string }>({ c: '', p: '' });
  const router = useRouter();

  function encolarOperacion(ejecutar: () => Promise<void>) {
    chainRef.current = chainRef.current.then(ejecutar).catch((err) => {
      console.error('Operación de cola fallida:', err);
    });
  }
  // Elemento siendo arrastrado y destino actual (para feedback visual)
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Priorización por sucursal: cada sucursal tiene su propia cola y se
  // gestiona por separado (ya no hay una cola mixta de varias sucursales).
  const resumen = useMemo(
    () => resumenPrioridadPorSucursal(solicitudes, sucursalesAsignadas),
    [solicitudes, sucursalesAsignadas]
  );
  const [sucursalActiva, setSucursalActiva] = useState<number | null>(() => sucursalInicial(resumen));

  const { cola, porPriorizar } = useMemo(
    () => colaDeSucursal(solicitudes, sucursalActiva),
    [solicitudes, sucursalActiva]
  );

  // Estado local: orden de la cola y lista "Por Priorizar" (para DnD optimista).
  // Se inicializan desde los props para que SSR y cliente coincidan y no haya flash.
  const [orden, setOrden] = useState<string[]>(() => cola.map((s) => s.id));
  const [porIds, setPorIds] = useState<string[]>(() => porPriorizar.map((s) => s.id));

  function setListas(ordenNuevo: string[], porNuevo: string[]) {
    listasRef.current = { orden: ordenNuevo, por: porNuevo };
    setOrden(ordenNuevo);
    setPorIds(porNuevo);
  }

  const porIdsSet = useMemo(() => new Set(porIds), [porIds]);

  const dataPorId = useMemo(() => {
    const map = new Map<string, SolicitudLista>();
    solicitudes.forEach((s) => map.set(s.id, s));
    return map;
  }, [solicitudes]);

  // Sincronizar el estado local cuando cambian la cola o "Por Priorizar" desde el servidor.
  useEffect(() => {
    if (pendingOps > 0) return;
    const cStr = cola.map((s) => s.id).join('|');
    const pStr = porPriorizar.map((s) => s.id).join('|');
    const cChanged = lastSyncRef.current.c !== cStr && !timerRef.current;
    const pChanged = lastSyncRef.current.p !== pStr;
    if (!cChanged && !pChanged) return;

    lastSyncRef.current = { c: cStr, p: pStr };
    setListas(
      cChanged ? cola.map((s) => s.id) : listasRef.current.orden,
      pChanged ? porPriorizar.map((s) => s.id) : listasRef.current.por
    );
  }, [cola, porPriorizar, pendingOps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function mostrarFeedback(msg: string, type: 'success' | 'error') {
    setFeedback({ type, message: msg });
  }

  function programarReorden(nuevoOrden: string[], sucursalId: number) {
    setListas(nuevoOrden, listasRef.current.por);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      encolarOperacion(async () => {
        // La cola es por sucursal: solo reescribir el bloque de la sucursal
        // que se está reordenando (no tocar las posiciones de las otras).
        const suborden = nuevoOrden.filter(
          (id2) => dataPorId.get(id2)?.sucursal === sucursalId
        );
        if (suborden.length === 0) return;
        const result = await reordenarColaAction(sucursalId, suborden);
        mostrarFeedback(
          result.success ? 'Cola de prioridades actualizada.' : result.error || 'Error al reordenar.',
          result.success ? 'success' : 'error'
        );
      });
    }, 500);
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  function handleDragEnd(event: { active: { id: string | number }; over: { id: string | number } | null }) {
    setActiveId(null);
    setOverId(null);
    const { active, over } = event;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    if (aId === oId) return;

    const enCola = orden.includes(aId);
    const enPor = porIdsSet.has(aId);
    if (!enCola && !enPor) return;

    const sobreCola = orden.includes(oId) || oId === ZONA_COLA_VACIA;
    const sobrePor = porIdsSet.has(oId) || oId === ZONA_POR_PRIORIZAR;

    // Reordenar dentro de la cola
    if (enCola && orden.includes(oId)) {
      const prevOrden = listasRef.current.orden;
      const oldIndex = prevOrden.indexOf(aId);
      const newIndex = prevOrden.indexOf(oId);
      if (oldIndex === -1 || newIndex === -1) return;
      const suc = dataPorId.get(aId)?.sucursal ?? dataPorId.get(oId)?.sucursal;
      if (suc === null || suc === undefined) return;
      programarReorden(arrayMove(prevOrden, oldIndex, newIndex), suc);
      return;
    }

    // Soltar un ítem de la cola fuera de ella = sacarla de la cola
    if (enCola && sobrePor) {
      const sol = dataPorId.get(aId);
      if (sol) sacarDeColaOptimista(sol);
      return;
    }

    // Soltar un ítem "Por Priorizar" sobre la cola = priorizar en esa posición
    if (enPor && sobreCola) {
      const sol = dataPorId.get(aId);
      if (sol) priorizarOptimista(sol, oId);
      return;
    }

    // Arrastre dentro de "Por Priorizar": sin efecto
  }

  // Cantidad de ítems de la misma sucursal que preceden al destino
  // (soporta la cola mixta por sucursal que ve el administrador).
  function itemsAntesEnSucursal(aId: string, sucursal: number): number {
    let antes = 0;
    for (const qid of listasRef.current.orden) {
      if (qid === aId) break;
      if (dataPorId.get(qid)?.sucursal === sucursal) antes++;
    }
    return antes;
  }

  // Índice en la cola local donde insertar `sol` al soltarla sobre `overIdTarget`
  // (delante del bloque de su sucursal o, si no aplica, al final de la cola).
  function indiceInsercion(sol: SolicitudLista, overIdTarget: string | null): number {
    const colaActual = listasRef.current.orden;
    if (overIdTarget && colaActual.includes(overIdTarget)) {
      const overSol = dataPorId.get(overIdTarget);
      if (overSol && overSol.sucursal === sol.sucursal) {
        return colaActual.indexOf(overIdTarget);
      }
    }
    let idx = colaActual.length;
    for (let i = colaActual.length - 1; i >= 0; i--) {
      const q = dataPorId.get(colaActual[i]);
      if (q && q.sucursal === sol.sucursal) {
        idx = i + 1;
        break;
      }
    }
    return idx;
  }

  // Prioriza `sol` de forma optimista (se mueve al instante) y persiste en segundo plano.
  // Las operaciones se encolan en serie para evitar choques contra la clave única
  // (sucursal, posicion_prioridad) y transiciones de estado inválidas.
  function priorizarOptimista(sol: SolicitudLista, overIdTarget: string | null) {
    const snapOrden = listasRef.current.orden;
    const snapPor = listasRef.current.por;

    const nuevoOrden = [...snapOrden];
    nuevoOrden.splice(indiceInsercion(sol, overIdTarget), 0, sol.id);
    setListas(nuevoOrden, snapPor.filter((id) => id !== sol.id));
    setPendingOps((p) => p + 1);

    encolarOperacion(async () => {
      // Recalcular la posición al ejecutar, contra el estado local ya optimista,
      // para que sea coherente con las operaciones previas ya persistidas.
      let posicion: number | null = null;
      if (overIdTarget && listasRef.current.orden.includes(overIdTarget)) {
        const overSol = dataPorId.get(overIdTarget);
        if (overSol && overSol.sucursal === sol.sucursal) {
          posicion = itemsAntesEnSucursal(overIdTarget, sol.sucursal) + 1;
        }
      }
      const result =
        posicion !== null
          ? await priorizarEnPosicionAction(sol.id, posicion)
          : await priorizarSolicitudAction(sol.id);
      if (!result.success) {
        setListas(snapOrden, snapPor);
        mostrarFeedback(result.error || 'Error al priorizar.', 'error');
        router.refresh();
      } else {
        mostrarFeedback(result.message || 'Solicitud priorizada.', 'success');
      }
      setPendingOps((p) => Math.max(0, p - 1));
    });
  }

  // Saca `sol` de la cola de forma optimista y persiste en segundo plano.
  function sacarDeColaOptimista(sol: SolicitudLista) {
    const snapOrden = listasRef.current.orden;
    const snapPor = listasRef.current.por;

    setListas(
      snapOrden.filter((id) => id !== sol.id),
      snapPor.includes(sol.id) ? snapPor : [...snapPor, sol.id]
    );
    setPendingOps((p) => p + 1);

    encolarOperacion(async () => {
      const result = await sacarDeColaAction(sol.id);
      if (!result.success) {
        setListas(snapOrden, snapPor);
        mostrarFeedback(result.error || 'Error al sacar de la cola.', 'error');
        router.refresh();
      } else {
        mostrarFeedback(result.message || 'Sacada de la cola.', 'success');
      }
      setPendingOps((p) => Math.max(0, p - 1));
    });
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prioridades</h1>
        <p className="text-sm text-neutral-500">
          Cada sucursal tiene su propia cola. Elige la sucursal y arrastra una solicitud desde &quot;Por Priorizar&quot;
          hacia la cola para priorizarla en la posición donde la sueltes. Arrastra dentro de la cola para
          reordenarla; arrástrala fuera de la cola para sacarla.
        </p>
      </div>

      {resumen.length === 0 ? (
        <div className="p-10 text-center border border-dashed rounded-2xl border-neutral-200 text-neutral-400 bg-white">
          No tienes sucursales asignadas para gestionar prioridades.
        </div>
      ) : (
        <div role="tablist" aria-label="Sucursales" className="flex flex-wrap gap-2">
          {resumen.map((r) => {
            const activa = r.id === sucursalActiva;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setSucursalActiva(r.id)}
                disabled={pendingOps > 0}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  activa
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <span>{r.nombre}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${activa ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>
                  {r.enCola} en cola
                </span>
                {r.porPriorizar > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-amber-100 text-amber-800">
                    {r.porPriorizar} por priorizar
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Cola de prioridades */}
        <section className="lg:col-span-3 bg-white rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ListOrdered className="w-5 h-5 text-neutral-700" />
            <h2 className="font-semibold text-neutral-900">
              Cola de Prioridades
              {sucursalActiva !== null && (
                <span className="font-normal text-neutral-500">
                  {' · '}
                  {resumen.find((r) => r.id === sucursalActiva)?.nombre}
                </span>
              )}
            </h2>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-neutral-100 text-xs text-neutral-600">
              {orden.length}
            </span>
          </div>

          {orden.length === 0 ? (
            <ZonaColaVacia activa={activeId !== null && porIdsSet.has(activeId)} />
          ) : (
            <SortableContext items={orden} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {orden.map((id, idx) => {
                  const sol = dataPorId.get(id);
                  if (!sol) return null;
                  const esDestino = overId === id && activeId !== null && porIdsSet.has(activeId);
                  return (
                    <SolicitudCard key={id} id={id} sol={sol} variant="cola" pos={idx + 1} onSacar={sacarDeColaOptimista} resaltado={esDestino} />
                  );
                })}
              </div>
            </SortableContext>
          )}
        </section>

        {/* Por priorizar */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="w-5 h-5 text-neutral-700" />
            <h2 className="font-semibold text-neutral-900">Por Priorizar</h2>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-neutral-100 text-xs text-neutral-600">
              {porIds.length}
            </span>
          </div>

          {porIds.length === 0 ? (
            <ZonaPorPriorizarVacia />
          ) : (
            <SortableContext items={porIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {porIds.map((id) => {
                  const sol = dataPorId.get(id);
                  if (!sol) return null;
                  return (
                    <SolicitudCard key={sol.id} id={sol.id} sol={sol} variant="porPriorizar" />
                  );
                })}
              </div>
            </SortableContext>
          )}
        </section>
      </div>

      <DragOverlay>
        {activeId && dataPorId.has(activeId) ? (
          <TarjetaArrastre sol={dataPorId.get(activeId)!} enCola={orden.includes(activeId)} />
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  );
}

function getEncargadoId(sol: SolicitudLista): string | null {
  return sol.ejecutivo_id || sol.jefe_local_id || null;
}

function getEncargadoNombre(sol: SolicitudLista): string | null {
  if (sol.ejecutivo_id) return sol.ejecutivo_nombre;
  if (sol.jefe_local_id) return sol.jefe_local_nombre;
  return null;
}

// Identificación del vehículo: patente (si existe), marca modelo año y chasis.
function LineaVehiculo({ v }: { v: VehiculoAsociado }) {
  const patente = v.patente?.trim();
  return (
    <div className="flex items-center gap-2 text-xs">
      <Car className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      {patente ? (
        <>
          <span className="font-semibold text-neutral-900">{patente}</span>
          <span className="text-neutral-400">·</span>
        </>
      ) : null}
      <span className="font-semibold text-neutral-900">{nombreVehiculoConAnio(v)}</span>
      <span className="text-neutral-400">·</span>
      <span className="text-neutral-500 font-mono text-[11px]">{v.chasis}</span>
    </div>
  );
}

function SolicitudCard({
  id,
  sol,
  variant,
  pos,
  onSacar,
  resaltado,
}: {
  id: string;
  sol: SolicitudLista;
  variant: 'cola' | 'porPriorizar';
  pos?: number;
  onSacar?: (sol: SolicitudLista) => void;
  resaltado?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const estadoAtraso = getEstadoAtraso(sol);
  const chipAtraso = CHIP_ATRASO[estadoAtraso];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`p-3 rounded-xl border bg-white cursor-grab active:cursor-grabbing transition-colors ${
        isDragging
          ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-lg opacity-60'
          : resaltado
            ? 'border-neutral-900 ring-2 ring-neutral-900/40'
            : `border-neutral-200 hover:border-neutral-300 ${BORDE_ATRASO[estadoAtraso]}`
      }`}
    >
      <div className="flex items-start gap-3">
        {variant === 'cola' ? (
          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-neutral-900 text-white text-sm font-bold">
            {pos}
          </span>
        ) : (
          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-neutral-100 text-neutral-500">
            <GripVertical className="w-4 h-4" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-neutral-500">#{sol.id.slice(0, 8)}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">
              {tipoLabel[sol.tipo_solicitud]}
            </span>
            {chipAtraso && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${chipAtraso.clase}`}>
                {chipAtraso.texto}
              </span>
            )}
          </div>

          {sol.vehiculos.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {sol.vehiculos.map((v) => (
                <LineaVehiculo key={v.solicitud_vehiculo_id} v={v} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-neutral-400">Sin vehículos asignados</p>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatFecha(sol.fecha_limite)}
            </span>
            {getEncargadoNombre(sol) && (
              <span className="text-neutral-400">· <UsuarioNombreBoton usuarioId={getEncargadoId(sol)} nombre={getEncargadoNombre(sol)} muted /></span>
            )}
          </div>
        </div>

        {variant === 'cola' && onSacar && (
          <button
            onClick={() => onSacar(sol)}
            title="Sacar de la cola"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Zona droppable cuando la cola está vacía: permite arrastrar la primera solicitud
function ZonaColaVacia({ activa }: { activa: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ZONA_COLA_VACIA });
  return (
    <div
      ref={setNodeRef}
      className={`p-10 text-center border border-dashed rounded-xl transition-colors ${
        isOver && activa
          ? 'border-neutral-900 bg-neutral-50 text-neutral-700'
          : 'border-neutral-200 text-neutral-400'
      }`}
    >
      <Inbox className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
      <p>La cola está vacía.</p>
      <p className="text-xs">Arrastra una solicitud desde &quot;Por Priorizar&quot; para priorizarla.</p>
    </div>
  );
}

// Zona droppable cuando no hay solicitudes por priorizar: permite "sacar de la cola" arrastrando
function ZonaPorPriorizarVacia() {
  const { setNodeRef, isOver } = useDroppable({ id: ZONA_POR_PRIORIZAR });
  return (
    <div
      ref={setNodeRef}
      className={`p-6 text-center border border-dashed rounded-xl text-xs transition-colors ${
        isOver
          ? 'border-red-400 bg-red-50/40 text-red-600'
          : 'border-neutral-200 text-neutral-400'
      }`}
    >
      No hay solicitudes aprobadas sin priorizar.
      <br />
      Suelta aquí una solicitud de la cola para sacarla.
    </div>
  );
}

// Vista previa flotante del ítem mientras se arrastra (DragOverlay)
function TarjetaArrastre({ sol, enCola }: { sol: SolicitudLista; enCola: boolean }) {
  return (
    <div className="p-3 rounded-xl border-2 border-neutral-900 bg-white shadow-lg w-72">
      <div className="flex items-start gap-3">
        {enCola ? (
          <span className="w-8 h-8 shrink-0" />
        ) : (
          <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-neutral-100 text-neutral-500">
            <GripVertical className="w-4 h-4" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-neutral-500">#{sol.id.slice(0, 8)}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">
              {tipoLabel[sol.tipo_solicitud]}
            </span>
          </div>
          {sol.vehiculos.length > 0 && (
            <div className="mt-2 space-y-1">
              {sol.vehiculos.map((v) => (
                <LineaVehiculo key={v.solicitud_vehiculo_id} v={v} />
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatFecha(sol.fecha_limite)}
            </span>
            {getEncargadoNombre(sol) && (
              <span className="text-neutral-400">· <UsuarioNombreBoton usuarioId={getEncargadoId(sol)} nombre={getEncargadoNombre(sol)} muted /></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
