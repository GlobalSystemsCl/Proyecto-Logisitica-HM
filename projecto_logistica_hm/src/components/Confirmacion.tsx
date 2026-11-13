'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { opcionesAviso, opcionesConfirmacion, type EntradaConfirmacion, type OpcionesConfirmacion } from '@/lib/confirmacion';

/**
 * QA #33: reemplazo de `window.confirm`. Uso:
 *
 *   const { confirmar, dialogoConfirmacion } = useConfirmacion();
 *   if (!(await confirmar({ mensaje: '¿Seguro?', peligro: true }))) return;
 *   ...
 *   return <>{...}{dialogoConfirmacion}</>;
 */
export function useConfirmacion() {
  const [pendiente, setPendiente] = useState<{
    opciones: OpcionesConfirmacion;
    resolver: (ok: boolean) => void;
  } | null>(null);

  const confirmar = useCallback(
    (entrada: EntradaConfirmacion) =>
      new Promise<boolean>((resolver) => {
        setPendiente({ opciones: opcionesConfirmacion(entrada), resolver });
      }),
    [],
  );

  const responder = useCallback(
    (ok: boolean) => {
      pendiente?.resolver(ok);
      setPendiente(null);
    },
    [pendiente],
  );

  /** Reemplazo de `window.alert`: muestra el mensaje y espera "Entendido". */
  const avisar = useCallback(
    (mensaje: string, titulo?: string) =>
      new Promise<void>((resolver) => {
        setPendiente({ opciones: opcionesAviso(mensaje, titulo), resolver: () => resolver() });
      }),
    [],
  );

  const dialogoConfirmacion = pendiente ? (
    <DialogoConfirmacion opciones={pendiente.opciones} onResponder={responder} />
  ) : null;

  return { confirmar, avisar, dialogoConfirmacion };
}

function DialogoConfirmacion({
  opciones,
  onResponder,
}: {
  opciones: OpcionesConfirmacion;
  onResponder: (ok: boolean) => void;
}) {
  const confirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmarRef.current?.focus();
    function alPresionar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onResponder(false);
    }
    // Captura: se adelanta al Escape del modal que esté debajo.
    document.addEventListener('keydown', alPresionar, true);
    return () => document.removeEventListener('keydown', alPresionar, true);
  }, [onResponder]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmacion-titulo"
      aria-describedby="confirmacion-mensaje"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={() => onResponder(false)}
    >
      <div
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
              opciones.peligro ? 'bg-red-50 text-red-600' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="confirmacion-titulo" className="text-base font-bold text-neutral-900">
              {opciones.titulo}
            </h2>
            <p id="confirmacion-mensaje" className="mt-1 text-sm text-neutral-600 whitespace-pre-line break-words">
              {opciones.mensaje}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {!opciones.soloAviso && (
          <button
            type="button"
            onClick={() => onResponder(false)}
            className="px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
          >
            {opciones.textoCancelar}
          </button>
          )}
          <button
            ref={confirmarRef}
            type="button"
            onClick={() => onResponder(true)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer ${
              opciones.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-700'
            }`}
          >
            {opciones.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
