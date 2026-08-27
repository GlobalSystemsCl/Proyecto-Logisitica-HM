'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
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
  ArrowUpRight,
  ListOrdered,
  Inbox,
} from 'lucide-react';
import {
  priorizarSolicitudAction,
  reordenarColaAction,
  sacarDeColaAction,
} from '@/app/actions/solicitudes.actions';
import { SolicitudLista, TipoSolicitud } from '@/types/solicitud.types';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface ViewerInfo {
  id: string;
  nombre: string;
  apellido: string;
  rol: 'administrador' | 'ejecutivo' | 'jefe_local' | 'logistica';
  sucursal_id: number | null;
}

interface PrioridadesClientProps {
  solicitudes: SolicitudLista[];
  viewer: ViewerInfo;
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL');
}

const tipoLabel: Record<TipoSolicitud, string> = {
  venta: 'Venta',
  evento: 'Evento',
};

export default function PrioridadesClient({
  solicitudes,
  viewer,
}: PrioridadesClientProps) {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado local del orden de la cola (para reordenamiento optimista con debounce)
  const [orden, setOrden] = useState<string[]>([]);

  const esAdmin = viewer.rol === 'administrador';
  const esJefeLocal = viewer.rol === 'jefe_local';

  const sucursalQueVale = useMemo<number | null>(() => {
    if (esAdmin) return null; // admin ve todas las sucursales; la cola se agrupa por sucursal
    if (esJefeLocal) return viewer.sucursal_id;
    return null;
  }, [esAdmin, esJefeLocal, viewer.sucursal_id]);

  // Solicitudes priorizadas = cola. Para admin, agrupar por sucursal.
  const cola = useMemo(() => {
    let lista = solicitudes.filter(
      (s) => s.estado === 'priorizada' && s.posicion_prioridad !== null
    );
    if (sucursalQueVale !== null) {
      lista = lista.filter((s) => s.sucursal === sucursalQueVale);
    }
    return lista.sort(
      (a, b) => (a.posicion_prioridad ?? 0) - (b.posicion_prioridad ?? 0)
    );
  }, [solicitudes, sucursalQueVale]);

  const porPriorizar = useMemo(() => {
    let lista = solicitudes.filter(
      (s) => s.estado === 'aprobada' && s.posicion_prioridad === null
    );
    if (sucursalQueVale !== null) {
      lista = lista.filter((s) => s.sucursal === sucursalQueVale);
    }
    return lista;
  }, [solicitudes, sucursalQueVale]);

  // Sincronizar el orden local cuando cambia la cola desde el servidor
  useEffect(() => {
    const ids = cola.map((s) => s.id);
    if (JSON.stringify(orden) !== JSON.stringify(ids) && !timerRef.current) {
      setOrden(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola]);

  const dataPorId = useMemo(() => {
    const map = new Map<string, SolicitudLista>();
    solicitudes.forEach((s) => map.set(s.id, s));
    return map;
  }, [solicitudes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function mostrarFeedback(msg: string, type: 'success' | 'error') {
    setFeedback({ type, message: msg });
  }

  function programarReorden(nuevoOrden: string[]) {
    setOrden(nuevoOrden);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      const suc = sucursalQueVale;
      if (suc === null) {
        mostrarFeedback('Los administradores deben elegir una sucursal para reordenar.', 'error');
        return;
      }
      const result = await reordenarColaAction(suc, nuevoOrden);
      mostrarFeedback(
        result.success ? 'Cola de prioridades actualizada.' : result.error || 'Error al reordenar.',
        result.success ? 'success' : 'error'
      );
    }, 500);
  }

  function handleDragEnd(event: { active: { id: string | number }; over: { id: string | number } | null }) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aId = String(active.id);
    const oId = String(over.id);
    setOrden((prev) => {
      const oldIndex = prev.indexOf(aId);
      const newIndex = prev.indexOf(oId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const nuevo = arrayMove(prev, oldIndex, newIndex);
      programarReorden(nuevo);
      return nuevo;
    });
  }

  async function handlePriorizar(sol: SolicitudLista) {
    setIsSubmitting(true);
    try {
      const result = await priorizarSolicitudAction(sol.id);
      mostrarFeedback(
        result.success
          ? `${result.message}`
          : result.error || 'Error al priorizar.',
        result.success ? 'success' : 'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSacarDeCola(sol: SolicitudLista) {
    setIsSubmitting(true);
    try {
      const result = await sacarDeColaAction(sol.id);
      mostrarFeedback(
        result.success ? result.message || 'Sacada de la cola.' : result.error || 'Error.',
        result.success ? 'success' : 'error'
      );
    } finally {
      setIsSubmitting(false);
    }
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
          Organiza la cola de prioridades de tu sucursal. Arrastra para reordenar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Cola de prioridades */}
        <section className="lg:col-span-3 bg-white rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ListOrdered className="w-5 h-5 text-neutral-700" />
            <h2 className="font-semibold text-neutral-900">Cola de Prioridades</h2>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-neutral-100 text-xs text-neutral-600">
              {orden.length}
            </span>
          </div>

          {orden.length === 0 ? (
            <div className="p-10 text-center text-neutral-400 border border-dashed border-neutral-200 rounded-xl">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
              <p>La cola está vacía.</p>
              <p className="text-xs">Agrega solicitudes desde la lista lateral.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orden} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {orden.map((id, idx) => {
                    const sol = dataPorId.get(id);
                    if (!sol) return null;
                    return (
                      <SortableItem key={id} id={id} pos={idx + 1} sol={sol} onSacar={handleSacarDeCola} isSubmitting={isSubmitting} />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>

        {/* Por priorizar */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="w-5 h-5 text-neutral-700" />
            <h2 className="font-semibold text-neutral-900">Por Priorizar</h2>
            <span className="ml-auto px-2.5 py-0.5 rounded-full bg-neutral-100 text-xs text-neutral-600">
              {porPriorizar.length}
            </span>
          </div>

          {porPriorizar.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8">
              No hay solicitudes aprobadas sin priorizar.
            </p>
          ) : (
            <div className="space-y-2">
              {porPriorizar.map((sol) => (
                <div key={sol.id} className="p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-neutral-500">#{sol.id.slice(0, 8)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-200">
                      {tipoLabel[sol.tipo_solicitud]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-900">
                    {sol.sucursal_nombre || 'Sucursal'}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatFecha(sol.fecha_limite)}
                    </span>
                    {sol.vehiculos.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Car className="w-3 h-3" /> {sol.vehiculos.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handlePriorizar(sol)}
                    disabled={isSubmitting}
                    className="mt-2 w-full px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-700 disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Priorizar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SortableItem({
  id,
  pos,
  sol,
  onSacar,
  isSubmitting,
}: {
  id: string;
  pos: number;
  sol: SolicitudLista;
  onSacar: (sol: SolicitudLista) => void;
  isSubmitting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 rounded-xl border bg-white cursor-grab active:cursor-grabbing ${
        isDragging ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-lg' : 'border-neutral-200 hover:border-neutral-300'
      }`}
    >
      <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-neutral-900 text-white text-sm font-bold">
        {pos}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-900 truncate">
            {sol.sucursal_nombre || 'Sucursal'}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">
            #{sol.id.slice(0, 6)}
          </span>
        </div>
        <div className="text-xs text-neutral-500">
          {tipoLabel[sol.tipo_solicitud]} · Límite: {formatFecha(sol.fecha_limite)}
        </div>
        {sol.vehiculos.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {sol.vehiculos.map((v) => (
              <span
                key={v.solicitud_vehiculo_id}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-50 border border-neutral-200 text-[10px] text-neutral-600"
              >
                <Car className="w-2.5 h-2.5" />
                {v.patente}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => onSacar(sol)}
        disabled={isSubmitting}
        title="Sacar de la cola"
        className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
