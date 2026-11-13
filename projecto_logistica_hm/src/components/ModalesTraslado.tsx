'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarClock, Camera, Loader2, PackageCheck, Truck, X } from 'lucide-react';
import type { DatosRecepcion } from '@/lib/recepcion';
import { validarMotivoCancelacion, validarRecepcion } from '@/lib/recepcion';
import { formatFechaLarga, hoyISO } from '@/lib/fechas';
import { errorFechaProgramacion } from '@/lib/calendario';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';
import SelectorCamion from '@/components/SelectorCamion';
import { errorAsignacionTransporte } from '@/lib/transporte';
import type { AsignacionTransporte, EmpresaTransporte } from '@/types/transportista.types';

/**
 * Modales compartidos por el calendario de logística, la bandeja de
 * recepciones y los traslados internos (R8, R13 y recalendarización).
 */

interface MarcoProps {
  titulo: string;
  subtitulo?: string;
  icono: React.ReactNode;
  onCerrar: () => void;
  children: React.ReactNode;
}

function Marco({ titulo, subtitulo, icono, onCerrar, children }: MarcoProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-neutral-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">{icono}</div>
            <div>
              <h3 className="font-bold text-neutral-900">{titulo}</h3>
              {subtitulo && <p className="text-xs text-neutral-500 mt-0.5">{subtitulo}</p>}
            </div>
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function MensajeError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{mensaje}</p>;
}

function Botones({
  onCancelar,
  enviando,
  textoConfirmar,
  peligro,
}: {
  onCancelar: () => void;
  enviando: boolean;
  textoConfirmar: string;
  peligro?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancelar}
        disabled={enviando}
        className="px-4 py-2 text-sm font-semibold text-neutral-600 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
      >
        Volver
      </button>
      <button
        type="submit"
        disabled={enviando}
        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-xl cursor-pointer disabled:opacity-50 ${
          peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-700'
        }`}
      >
        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
        {textoConfirmar}
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Recepción (R13)
// -----------------------------------------------------------------------------

interface RecepcionModalProps {
  titulo: string;
  subtitulo?: string;
  /** QA #20: qué vehículos se reciben (una línea por vehículo). */
  vehiculos?: string[];
  /** Fotos opcionales: quedan como documentos de la solicitud o del traslado (QA #49). */
  permitirFotos?: boolean;
  onCerrar: () => void;
  /** Devuelve un mensaje de error para mostrar, o `null` si todo salió bien. */
  onConfirmar: (datos: DatosRecepcion, fotos: File[]) => Promise<string | null>;
}

export function RecepcionModal({ titulo, subtitulo, vehiculos, permitirFotos, onCerrar, onConfirmar }: RecepcionModalProps) {
  const [conNovedades, setConNovedades] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const datos: DatosRecepcion = { conNovedades, observacion };
    const errorValidacion = validarRecepcion(datos);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }
    setEnviando(true);
    try {
      const resultado = await onConfirmar(datos, fotos);
      if (resultado) setError(resultado);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco titulo={titulo} subtitulo={subtitulo} icono={<PackageCheck className="w-5 h-5 text-green-700" />} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        {vehiculos && vehiculos.length > 0 && (
          <ul className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 space-y-0.5">
            {vehiculos.map((v) => (
              <li key={v} className="font-mono break-all">{v}</li>
            ))}
          </ul>
        )}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Estado del vehículo</legend>
          <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
            <input type="radio" name="novedades" checked={!conNovedades} onChange={() => setConNovedades(false)} />
            Llegó sin novedades
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
            <input type="radio" name="novedades" checked={conNovedades} onChange={() => setConNovedades(true)} />
            Llegó con novedades (daños, faltantes u otro problema)
          </label>
        </fieldset>

        <div>
          <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">
            Observación {conNovedades ? '*' : '(opcional)'}
          </label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={conNovedades ? 'Describe la novedad' : 'Comentario de la recepción'}
            className="w-full rounded-xl border border-neutral-300 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        {permitirFotos && (
          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Fotos (opcional)</label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-600 cursor-pointer hover:bg-neutral-50">
              <Camera className="w-4 h-4" />
              {fotos.length > 0 ? `${fotos.length} foto(s) seleccionada(s)` : 'Adjuntar fotos (JPG, PNG o WEBP)'}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
              />
            </label>
          </div>
        )}

        <MensajeError mensaje={error} />
        <Botones onCancelar={onCerrar} enviando={enviando} textoConfirmar="Confirmar recepción" />
      </form>
    </Marco>
  );
}

// -----------------------------------------------------------------------------
// Cancelación en tránsito (R8)
// -----------------------------------------------------------------------------

interface CancelarTransitoModalProps {
  titulo: string;
  subtitulo?: string;
  sucursales: Array<{ id: number; nombre: string | null }>;
  /** Ubicación propuesta para el vehículo (normalmente la sucursal de origen). */
  ubicacionInicial: number | null;
  onCerrar: () => void;
  onConfirmar: (motivo: string, ubicacionId: number | null) => Promise<string | null>;
}

export function CancelarTransitoModal({
  titulo,
  subtitulo,
  sucursales,
  ubicacionInicial,
  onCerrar,
  onConfirmar,
}: CancelarTransitoModalProps) {
  const [motivo, setMotivo] = useState('');
  const [ubicacion, setUbicacion] = useState<string>(ubicacionInicial !== null ? String(ubicacionInicial) : '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const errorMotivo = validarMotivoCancelacion(motivo);
    if (errorMotivo) {
      setError(errorMotivo);
      return;
    }
    setEnviando(true);
    try {
      const resultado = await onConfirmar(motivo.trim(), ubicacion === '' ? null : Number(ubicacion));
      if (resultado) setError(resultado);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco titulo={titulo} subtitulo={subtitulo} icono={<AlertTriangle className="w-5 h-5 text-red-600" />} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Motivo *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="¿Qué ocurrió?"
            className="w-full rounded-xl border border-neutral-300 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">
            ¿Dónde queda el vehículo? *
          </label>
          <select
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
          >
            <option value="">Sin sucursal (en ruta o en otro lugar)</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre ?? `Sucursal ${s.id}`}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-neutral-500 mt-1">El cambio de ubicación queda registrado en la auditoría.</p>
        </div>
        <p className="text-xs text-neutral-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Se avisará por correo a todos los involucrados. Esta acción no se puede deshacer.
        </p>
        <MensajeError mensaje={error} />
        <Botones onCancelar={onCerrar} enviando={enviando} textoConfirmar="Cancelar traslado" peligro />
      </form>
    </Marco>
  );
}

// -----------------------------------------------------------------------------
// Reprogramación de una solicitud calendarizada
// -----------------------------------------------------------------------------

interface ReprogramarModalProps {
  subtitulo?: string;
  fechaActual: string | null;
  /** Fecha precargada (por ejemplo, el día al que se arrastró la tarjeta). */
  fechaPropuesta?: string | null;
  /** R10: para cambiar el camión o el transportista junto con la fecha (opcional). */
  empresas?: EmpresaTransporte[];
  transporteActual?: AsignacionTransporte | null;
  onEmpresasCambiadas?: (empresas: EmpresaTransporte[]) => void;
  onCerrar: () => void;
  onConfirmar: (nuevaFecha: string, motivo: string, transporte: AsignacionTransporte | null) => Promise<string | null>;
}

export function ReprogramarModal({
  subtitulo,
  fechaActual,
  fechaPropuesta,
  empresas,
  transporteActual,
  onEmpresasCambiadas,
  onCerrar,
  onConfirmar,
}: ReprogramarModalProps) {
  const [fecha, setFecha] = useState((fechaPropuesta ?? fechaActual ?? '').slice(0, 10));
  const [transporte, setTransporte] = useState<AsignacionTransporte | null>(transporteActual ?? null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) {
      setError('Indica la nueva fecha de despacho.');
      return;
    }
    // Sin camión indicado se mantiene el transporte actual.
    const errorTransporte = empresas && transporte?.patente.trim() ? errorAsignacionTransporte(empresas, transporte) : null;
    if (errorTransporte) {
      setError(errorTransporte);
      return;
    }
    setEnviando(true);
    try {
      const resultado = await onConfirmar(fecha, motivo.trim(), transporte?.patente.trim() ? transporte : null);
      if (resultado) setError(resultado);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco
      titulo="Reprogramar traslado"
      subtitulo={subtitulo}
      icono={<CalendarClock className="w-5 h-5 text-blue-700" />}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Nueva fecha de despacho *</label>
          <input
            type="date"
            min={hoyISO()}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Motivo (recomendado)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-xl border border-neutral-300 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        {empresas && (
          <SelectorCamion
            empresas={empresas}
            valor={transporte}
            onCambiar={setTransporte}
            onEmpresasCambiadas={(lista) => onEmpresasCambiadas?.(lista)}
          />
        )}
        <p className="text-xs text-neutral-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Se enviará un aviso urgente por correo al ejecutivo y a los jefes de local.
        </p>
        <MensajeError mensaje={error} />
        <Botones onCancelar={onCerrar} enviando={enviando} textoConfirmar="Reprogramar" />
      </form>
    </Marco>
  );
}

// -----------------------------------------------------------------------------
// Programación de una solicitud (al soltarla en un día del calendario)
// -----------------------------------------------------------------------------

interface ProgramarModalProps {
  subtitulo?: string;
  /** Día elegido (al soltar en el calendario) o propuesto, `YYYY-MM-DD`. */
  fecha: string;
  /**
   * Muestra un selector para cambiar el día: es la forma de programar sin
   * arrastrar (pantallas táctiles, teclado).
   */
  elegirFecha?: boolean;
  /** Fecha límite propuesta: si el día la supera, se muestra el aviso. */
  fechaLimite: string | null;
  /** R10: empresas activas con sus camiones activos. */
  empresas: EmpresaTransporte[];
  onEmpresasCambiadas: (empresas: EmpresaTransporte[]) => void;
  onCerrar: () => void;
  onConfirmar: (transporte: AsignacionTransporte, fecha: string) => Promise<string | null>;
}

/**
 * Programar el traslado pide la patente del camión y su transportista
 * (obligatorios, R10) y avisa si el día supera la fecha límite propuesta.
 */
export function ProgramarModal({
  subtitulo,
  fecha,
  elegirFecha = false,
  fechaLimite,
  empresas,
  onEmpresasCambiadas,
  onCerrar,
  onConfirmar,
}: ProgramarModalProps) {
  const [dia, setDia] = useState(fecha);
  const [transporte, setTransporte] = useState<AsignacionTransporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fueraDePlazo = !!fechaLimite && !!dia && dia > fechaLimite.slice(0, 10);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const errorFecha = errorFechaProgramacion(dia, hoyISO());
    if (errorFecha) {
      setError(errorFecha);
      return;
    }
    const errorTransporte = errorAsignacionTransporte(empresas, transporte);
    if (errorTransporte || !transporte) {
      setError(errorTransporte);
      return;
    }
    setEnviando(true);
    try {
      const resultado = await onConfirmar(transporte, dia);
      if (resultado) setError(resultado);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Marco
      titulo="Programar traslado"
      subtitulo={subtitulo}
      icono={<Truck className="w-5 h-5 text-sky-700" />}
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {elegirFecha && (
          <div>
            <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Fecha de despacho *</label>
            <input
              type="date"
              min={hoyISO()}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          {!elegirFecha && (
            <div className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Fecha programada</p>
              <p className="font-bold text-neutral-900 mt-0.5 text-sm">{formatFechaLarga(dia + 'T12:00:00Z')}</p>
            </div>
          )}
          {fueraDePlazo && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">{ETIQUETA_FECHA_LIMITE}</p>
              <p className="font-bold text-red-700 mt-0.5 text-sm">{formatFechaLarga(fechaLimite)}</p>
            </div>
          )}
        </div>
        {fueraDePlazo && (
          <p className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            La fecha supera la fecha límite de entrega propuesta. Si confirmas, quedará programada igual.
          </p>
        )}
        <SelectorCamion
          empresas={empresas}
          valor={transporte}
          onCambiar={setTransporte}
          onEmpresasCambiadas={onEmpresasCambiadas}
          obligatorio
        />
        <MensajeError mensaje={error} />
        <Botones
          onCancelar={onCerrar}
          enviando={enviando}
          textoConfirmar={fueraDePlazo ? 'Programar igual' : 'Programar'}
          peligro={fueraDePlazo}
        />
      </form>
    </Marco>
  );
}
