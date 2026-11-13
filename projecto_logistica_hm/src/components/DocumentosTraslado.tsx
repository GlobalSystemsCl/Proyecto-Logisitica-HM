'use client';

import { useEffect, useState } from 'react';
import { Download, Eye, FileText, X } from 'lucide-react';
import {
  descargarDocumentoTrasladoAction,
  getDocumentosTrasladoAction,
  getVistasPreviasTrasladoAction,
} from '@/app/actions/traslados.actions';
import { esImagen } from '@/lib/archivos';
import { formatFecha } from '@/lib/fechas';
import type { DocumentoTraslado } from '@/types/traslado.types';

/**
 * QA #49: fotos y documentos de un traslado interno (los que se adjuntan al
 * recibirlo), con miniatura para las imágenes y vista sin descarga para PDF.
 */
export default function DocumentosTraslado({ trasladoId }: { trasladoId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoTraslado[] | null>(null);
  const [vistas, setVistas] = useState<Record<string, string>>({});
  const [ampliada, setAmpliada] = useState<DocumentoTraslado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([getDocumentosTrasladoAction(trasladoId), getVistasPreviasTrasladoAction(trasladoId)]).then(
      ([docs, urls]) => {
        if (cancelado) return;
        setDocumentos(docs);
        setVistas(urls);
      }
    );
    return () => {
      cancelado = true;
    };
  }, [trasladoId]);

  useEffect(() => {
    if (!ampliada) return;
    function alPresionar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setAmpliada(null);
    }
    document.addEventListener('keydown', alPresionar, true);
    return () => document.removeEventListener('keydown', alPresionar, true);
  }, [ampliada]);

  async function descargar(doc: DocumentoTraslado) {
    setError(null);
    const res = await descargarDocumentoTrasladoAction(doc.id);
    if (!res.success || !res.url) {
      setError(res.error ?? 'No se pudo descargar el documento.');
      return;
    }
    window.open(res.url, '_blank', 'noopener,noreferrer');
  }

  if (documentos === null) return <p className="text-xs text-neutral-400">Cargando documentos…</p>;
  if (documentos.length === 0) return <p className="text-sm text-neutral-400">Sin fotos ni documentos.</p>;

  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {documentos.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2">
            {esImagen(doc.tipo_mime) && vistas[doc.id] ? (
              <button
                type="button"
                onClick={() => setAmpliada(doc)}
                title="Ver imagen"
                className="w-12 h-12 rounded-lg overflow-hidden border border-neutral-200 shrink-0 cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage, de vida corta */}
                <img src={vistas[doc.id]} alt={doc.nombre_archivo} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-lg border border-neutral-200 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-neutral-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{doc.nombre_archivo}</p>
              <p className="text-xs text-neutral-500 truncate">
                {doc.subido_por_nombre ? `${doc.subido_por_nombre} · ` : ''}
                {formatFecha(doc.created_at)}
              </p>
            </div>
            {vistas[doc.id] && (
              <button
                type="button"
                onClick={() =>
                  esImagen(doc.tipo_mime) ? setAmpliada(doc) : window.open(vistas[doc.id], '_blank', 'noopener,noreferrer')
                }
                title="Ver"
                className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => descargar(doc)}
              title="Descargar"
              className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>

      {ampliada && vistas[ampliada.id] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ampliada.nombre_archivo}
          onClick={() => setAmpliada(null)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 p-4 bg-black/80"
        >
          <div className="flex items-center gap-2 max-w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-white truncate">{ampliada.nombre_archivo}</p>
            <button
              type="button"
              onClick={() => descargar(ampliada)}
              title="Descargar"
              className="p-2 rounded-lg text-white hover:bg-white/10 cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setAmpliada(null)}
              title="Cerrar"
              aria-label="Cerrar"
              className="p-2 rounded-lg text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage, de vida corta */}
          <img
            src={vistas[ampliada.id]}
            alt={ampliada.nombre_archivo}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
