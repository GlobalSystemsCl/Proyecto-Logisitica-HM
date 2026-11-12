'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, Search, Truck } from 'lucide-react';
import { descargarExcel } from '@/lib/excel';
import { formatFecha, hoyISO } from '@/lib/fechas';
import { formatearPatente } from '@/lib/patente';
import { coincideFilaTransito, filasExcelTransito, type FilaTransito } from '@/lib/transito';
import AbrirSolicitudDetalle from '@/components/AbrirSolicitudDetalle';

interface Props {
  filas: FilaTransito[];
  /** Usuario de Logística sin zonas: no tiene alcance. */
  sinZonas: boolean;
}

const COLUMNAS_EXCEL = [
  'Tipo', 'Código', 'Origen', 'Destino', 'Chasis', 'Vehículo', 'N° guía', 'Patente camión', 'Transportista',
  'Empresa de transporte', 'RUT empresa', 'Fecha despacho', 'Días en camino', 'Fecha límite', 'Atrasado',
];

/**
 * R5: vehículos en camino, sin estados intermedios. Primero los que llevan más
 * días; las solicitudes que ya pasaron su fecha límite se marcan atrasadas.
 */
export default function TransitoClient({ filas, sinZonas }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<'' | FilaTransito['tipo']>('');
  const [soloAtrasados, setSoloAtrasados] = useState(false);

  const visibles = useMemo(
    () => filas.filter((f) => (!tipo || f.tipo === tipo) && (!soloAtrasados || f.atrasado) && coincideFilaTransito(f, busqueda)),
    [filas, tipo, soloAtrasados, busqueda]
  );
  const atrasados = filas.filter((f) => f.atrasado).length;

  function exportar() {
    descargarExcel(`en_transito_${hoyISO()}.xlsx`, [
      { nombre: 'En tránsito', filas: filasExcelTransito(visibles), encabezados: COLUMNAS_EXCEL },
    ]);
  }

  const selectCls = 'bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Truck className="w-6 h-6" /> Vehículos en tránsito
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Lo despachado que aún no se recepciona: solicitudes y traslados internos, un vehículo por fila.
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={visibles.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl disabled:opacity-50 cursor-pointer self-start"
        >
          <Download className="w-4 h-4" /> Exportar a Excel
        </button>
      </div>

      {sinZonas && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          No tienes zonas asignadas, así que no hay traslados que mostrar. Pide al administrador que te asigne una zona.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">En camino</p>
          <p className="text-3xl font-bold text-neutral-900 mt-1">{filas.length}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-xs font-medium text-red-700 uppercase tracking-wider">Atrasados (pasó la fecha límite)</p>
          <p className="text-3xl font-bold text-red-900 mt-1">{atrasados}</p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value.slice(0, 30))}
            placeholder="Chasis, guía, código, patente o RUT"
            aria-label="Buscar en tránsito"
            className={`${selectCls} w-full pl-9`}
          />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={selectCls} aria-label="Tipo">
          <option value="">Solicitudes y traslados internos</option>
          <option value="solicitud">Solo solicitudes</option>
          <option value="interno">Solo traslados internos</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
          <input type="checkbox" checked={soloAtrasados} onChange={(e) => setSoloAtrasados(e.target.checked)} className="w-4 h-4" />
          Solo atrasados
        </label>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {visibles.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-400">
            {filas.length === 0 ? 'No hay vehículos en tránsito.' : 'Ningún vehículo coincide con los filtros.'}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {visibles.map((f) => (
              <li key={f.clave} className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="md:w-40 shrink-0">
                  {f.tipo === 'solicitud' ? (
                    <AbrirSolicitudDetalle solicitudId={f.entidadId} className="font-mono text-sm font-semibold">
                      {f.codigo}
                    </AbrirSolicitudDetalle>
                  ) : (
                    <Link
                      href={`/solicitudes/traslados?traslado=${encodeURIComponent(f.entidadId)}`}
                      className="font-mono text-sm font-semibold underline decoration-dotted underline-offset-2"
                    >
                      {f.codigo}
                    </Link>
                  )}
                  <p className="text-xs text-neutral-500">{f.tipo === 'solicitud' ? 'Solicitud' : 'Traslado interno'}</p>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p className="text-neutral-900">
                    {f.origen} → {f.destino}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {f.vehiculo} · <span className="font-mono break-all">{f.chasis}</span>
                    {f.guia && <> · Guía {f.guia}</>}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {[f.patenteCamion ? formatearPatente(f.patenteCamion) : null, f.transportista, f.empresa].filter(Boolean).join(' · ') ||
                      'Transporte sin registrar'}
                  </p>
                </div>
                <div className="md:text-right text-xs text-neutral-600 shrink-0">
                  <p>Despachado: {f.fechaDespacho ? formatFecha(f.fechaDespacho) : '—'}</p>
                  <p className="font-semibold text-neutral-900">
                    {f.dias === null ? '—' : f.dias === 1 ? '1 día en camino' : `${f.dias} días en camino`}
                  </p>
                  {f.atrasado && (
                    <p className="inline-flex items-center gap-1 text-red-700 font-semibold">
                      <AlertTriangle className="w-3 h-3" /> Atrasado (límite {formatFecha(f.fechaLimite)})
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
