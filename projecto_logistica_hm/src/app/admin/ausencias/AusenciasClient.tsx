'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Loader2, Plus } from 'lucide-react';
import { cancelarAusenciaAction, crearAusenciaAction } from '@/app/actions/ausencias.actions';
import { ETIQUETA_ESTADO_AUSENCIA, validarAusencia } from '@/lib/ausencias';
import { formatFecha } from '@/lib/fechas';
import type { Ausencia } from '@/services/ausencia.service';

interface Props {
  ausencias: Ausencia[];
  usuarios: Array<{ id: string; nombre: string; activo: boolean }>;
  hoy: string;
  /** Errores al procesar las pendientes al abrir la pantalla. */
  erroresProceso: string[];
}

const INPUT = 'w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900';
const CHIP: Record<Ausencia['estado'], string> = {
  programada: 'bg-amber-50 text-amber-800 border-amber-200',
  activa: 'bg-sky-50 text-sky-800 border-sky-200',
  finalizada: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  cancelada: 'bg-neutral-100 text-neutral-400 border-neutral-200',
};

/**
 * R9: el administrador registra la ausencia de un usuario de Logística (desde y
 * hasta) y su sustituto. Mientras dura, la cuenta del titular queda congelada,
 * sus solicitudes y traslados en curso pasan al sustituto y este atiende sus
 * zonas; al terminar, lo traspasado que siga abierto vuelve solo.
 */
export default function AusenciasClient({ ausencias, usuarios, hoy, erroresProceso }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({ titularId: '', sustitutoId: '', desde: hoy, hasta: hoy, motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(
    erroresProceso.length > 0 ? { tipo: 'error', mensaje: `No se pudieron procesar algunas ausencias: ${erroresProceso.join(' · ')}` } : null
  );

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const error = validarAusencia(form, hoy);
    if (error) {
      setFeedback({ tipo: 'error', mensaje: error });
      return;
    }
    setGuardando(true);
    try {
      const res = await crearAusenciaAction(form);
      if (!res.success) {
        setFeedback({ tipo: 'error', mensaje: res.error ?? 'No se pudo registrar la ausencia.' });
        return;
      }
      setFeedback({
        tipo: 'success',
        mensaje:
          form.desde <= hoy
            ? 'Ausencia iniciada: la cuenta quedó congelada y el sustituto ya tiene sus solicitudes, traslados y zonas.'
            : `Ausencia programada: comenzará el ${formatFecha(form.desde)}.`,
      });
      setForm({ titularId: '', sustitutoId: '', desde: hoy, hasta: hoy, motivo: '' });
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function cancelar(a: Ausencia) {
    const texto =
      a.estado === 'activa'
        ? `¿Terminar ahora la ausencia de ${a.titular_nombre}? Se reactiva su cuenta y vuelve lo traspasado que siga abierto.`
        : `¿Cancelar la ausencia programada de ${a.titular_nombre}?`;
    if (!window.confirm(texto)) return;
    setOcupado(a.id);
    try {
      const res = await cancelarAusenciaAction(a.id);
      setFeedback(
        res.success
          ? { tipo: 'success', mensaje: a.estado === 'activa' ? 'Ausencia terminada.' : 'Ausencia cancelada.' }
          : { tipo: 'error', mensaje: res.error ?? 'No se pudo completar la operación.' }
      );
      if (res.success) router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  const sustitutos = usuarios.filter((u) => u.activo && u.id !== form.titularId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <CalendarOff className="w-6 h-6" /> Ausencias de Logística
        </h1>
        <p className="text-sm text-neutral-500">
          Mientras dura la ausencia, la cuenta del titular queda congelada; sus solicitudes y traslados en curso pasan al
          sustituto, que además atiende sus zonas. Al terminar, lo que siga abierto vuelve solo al titular.
        </p>
      </header>

      {feedback && (
        <p
          role="status"
          className={`p-3 rounded-xl border text-sm ${
            feedback.tipo === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
          }`}
        >
          {feedback.mensaje}
        </p>
      )}

      <form onSubmit={crear} className="bg-white border border-neutral-200 rounded-2xl p-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Se ausenta *</span>
          <select value={form.titularId} onChange={(e) => setForm((f) => ({ ...f, titularId: e.target.value }))} className={INPUT}>
            <option value="">Selecciona…</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
                {u.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Sustituto *</span>
          <select value={form.sustitutoId} onChange={(e) => setForm((f) => ({ ...f, sustitutoId: e.target.value }))} className={INPUT}>
            <option value="">Selecciona…</option>
            {sustitutos.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Desde *</span>
          <input type="date" min={hoy} value={form.desde} onChange={(e) => setForm((f) => ({ ...f, desde: e.target.value }))} className={INPUT} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Hasta (último día de ausencia) *</span>
          <input type="date" min={form.desde || hoy} value={form.hasta} onChange={(e) => setForm((f) => ({ ...f, hasta: e.target.value }))} className={INPUT} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Motivo (opcional)</span>
          <input value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} maxLength={200} placeholder="Vacaciones, licencia…" className={INPUT} />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={guardando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl disabled:opacity-50 cursor-pointer"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Registrar ausencia
          </button>
        </div>
      </form>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {ausencias.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">No hay ausencias registradas.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {ausencias.map((a) => (
              <li key={a.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0 text-sm">
                  <p className="text-neutral-900">
                    <span className="font-semibold">{a.titular_nombre}</span> → cubre <span className="font-semibold">{a.sustituto_nombre}</span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    Del {formatFecha(a.desde)} al {formatFecha(a.hasta)}
                    {a.motivo ? ` · ${a.motivo}` : ''}
                  </p>
                </div>
                <span className={`self-start sm:self-auto px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${CHIP[a.estado]}`}>
                  {ETIQUETA_ESTADO_AUSENCIA[a.estado]}
                </span>
                {(a.estado === 'programada' || a.estado === 'activa') && (
                  <button
                    type="button"
                    onClick={() => cancelar(a)}
                    disabled={ocupado === a.id}
                    className="self-start sm:self-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                  >
                    {a.estado === 'activa' ? 'Terminar ahora' : 'Cancelar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
