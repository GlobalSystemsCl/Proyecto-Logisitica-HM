'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Search, Truck } from 'lucide-react';
import { descargarExcel } from '@/lib/excel';
import { formatFecha } from '@/lib/fechas';
import { formatearRut } from '@/lib/rut';
import {
  FILTROS_MOVIMIENTOS_VACIOS,
  SIN_TRANSPORTISTA,
  etiquetaEstadoMovimiento,
  filasExcelMovimientos,
  filtrarMovimientos,
  opcionesFiltrosMovimientos,
  resumenPorTransportista,
  type FiltrosMovimientos,
  type MovimientoTraslado,
} from '@/lib/reporteTraslados';

interface Props {
  desde: string;
  hasta: string;
  errorRango: string | null;
  movimientos: MovimientoTraslado[];
  /** Usuario de Logística sin zonas: no tiene alcance. */
  sinZonas: boolean;
}

const COLUMNAS_EXCEL = [
  'Fecha despacho', 'Tipo', 'Código', 'Origen', 'Destino', 'Chasis', 'Patente', 'Marca', 'Modelo',
  'Transportista', 'RUT transportista', 'Logística', 'Estado', 'Fecha recepción',
];

export default function MovimientosClient({ desde, hasta, errorRango, movimientos, sinZonas }: Props) {
  const router = useRouter();
  const [rango, setRango] = useState({ desde, hasta });
  const [filtros, setFiltros] = useState<FiltrosMovimientos>(FILTROS_MOVIMIENTOS_VACIOS);

  const opciones = useMemo(() => opcionesFiltrosMovimientos(movimientos), [movimientos]);
  const visibles = useMemo(() => filtrarMovimientos(movimientos, filtros), [movimientos, filtros]);
  const resumen = useMemo(() => resumenPorTransportista(visibles), [visibles]);
  const hayFiltros = Object.values(filtros).some(Boolean);

  function aplicarRango(e: React.FormEvent) {
    e.preventDefault();
    router.push(`?desde=${rango.desde}&hasta=${rango.hasta}`);
  }

  function exportar() {
    descargarExcel(`movimientos_${desde}_${hasta}.xlsx`, [
      { nombre: 'Movimientos', filas: filasExcelMovimientos(visibles), encabezados: COLUMNAS_EXCEL },
      {
        nombre: 'Por transportista',
        filas: resumen.map((r) => ({ Transportista: r.transportista, RUT: r.rut, Vehículos: r.vehiculos })),
        encabezados: ['Transportista', 'RUT', 'Vehículos'],
      },
    ]);
  }

  const selectCls = 'bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Truck className="w-6 h-6" /> Movimientos de traslados
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Todo lo despachado en el período (solicitudes y traslados internos), un vehículo por fila. Úsalo para revisar la factura del transportista.
          </p>
        </div>
        <form onSubmit={aplicarRango} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Despachados desde</label>
            <input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} className={selectCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Hasta</label>
            <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} className={selectCls} />
          </div>
          <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer">
            Ver período
          </button>
        </form>
      </div>

      {errorRango && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          {errorRango} Se muestra el mes en curso.
        </p>
      )}
      {sinZonas && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          No tienes zonas asignadas, así que no hay movimientos que mostrar. Pide al administrador que te asigne una zona.
        </p>
      )}

      <div className="bg-white border border-neutral-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <select value={filtros.transportista} onChange={(e) => setFiltros({ ...filtros, transportista: e.target.value })} className={selectCls} aria-label="Transportista">
          <option value="">Todos los transportistas</option>
          {opciones.transportistas.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
          <option value={SIN_TRANSPORTISTA}>Sin transportista</option>
        </select>
        <select value={filtros.origen} onChange={(e) => setFiltros({ ...filtros, origen: e.target.value })} className={selectCls} aria-label="Origen">
          <option value="">Todos los orígenes</option>
          {opciones.origenes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filtros.destino} onChange={(e) => setFiltros({ ...filtros, destino: e.target.value })} className={selectCls} aria-label="Destino">
          <option value="">Todos los destinos</option>
          {opciones.destinos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as FiltrosMovimientos['tipo'] })} className={selectCls} aria-label="Tipo">
          <option value="">Solicitudes y traslados internos</option>
          <option value="solicitud">Solo solicitudes</option>
          <option value="interno">Solo traslados internos</option>
        </select>
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className={selectCls} aria-label="Estado">
          <option value="">Todos los estados</option>
          {opciones.estados.map((e) => <option key={e} value={e}>{etiquetaEstadoMovimiento(e)}</option>)}
        </select>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={filtros.vehiculo}
            onChange={(e) => setFiltros({ ...filtros, vehiculo: e.target.value.slice(0, 30) })}
            placeholder="Chasis o patente"
            aria-label="Buscar chasis o patente"
            className={`${selectCls} w-full pl-9`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">
              {visibles.length} {visibles.length === 1 ? 'vehículo' : 'vehículos'}
              {hayFiltros && <span className="text-neutral-500 font-normal"> de {movimientos.length}</span>}
              <span className="text-neutral-500 font-normal"> · {formatFecha(desde)} al {formatFecha(hasta)}</span>
            </p>
            <div className="flex items-center gap-2">
              {hayFiltros && (
                <button onClick={() => setFiltros(FILTROS_MOVIMIENTOS_VACIOS)} className="text-xs font-semibold text-neutral-600 hover:underline cursor-pointer">
                  Limpiar filtros
                </button>
              )}
              <button
                onClick={exportar}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Exportar a Excel
              </button>
            </div>
          </div>
          {visibles.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
              No hay movimientos con esos filtros en el período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Despacho</th>
                    <th className="text-left px-4 py-2 font-semibold">Tipo</th>
                    <th className="text-left px-4 py-2 font-semibold">Origen → destino</th>
                    <th className="text-left px-4 py-2 font-semibold">Vehículo</th>
                    <th className="text-left px-4 py-2 font-semibold">Transportista</th>
                    <th className="text-left px-4 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visibles.map((m) => (
                    <tr key={m.clave} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 whitespace-nowrap">{formatFecha(m.fechaDespacho)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs text-neutral-500">{m.codigo}</span>
                        <span className="block text-xs text-neutral-600">{m.tipo === 'solicitud' ? 'Solicitud' : 'Traslado interno'}</span>
                      </td>
                      <td className="px-4 py-2">{m.origen} → {m.destino}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs">{m.chasis}</span>
                        <span className="block text-xs text-neutral-500">{m.marca} {m.modelo}</span>
                      </td>
                      <td className="px-4 py-2">
                        {m.transportistaNombre ? (
                          <>
                            {m.transportistaNombre}
                            {m.transportistaRut && <span className="block text-xs text-neutral-500">{formatearRut(m.transportistaRut)}</span>}
                          </>
                        ) : (
                          <span className="text-xs italic text-neutral-400">Sin registrar</span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs">{etiquetaEstadoMovimiento(m.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden h-fit">
          <p className="px-5 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-900">Vehículos por transportista</p>
          {resumen.length === 0 ? (
            <p className="px-5 py-4 text-sm text-neutral-500">Sin movimientos.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {resumen.map((r) => (
                <li key={`${r.transportista}-${r.rut}`} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{r.transportista}</p>
                    {r.rut && <p className="text-xs text-neutral-500">{r.rut}</p>}
                  </div>
                  <span className="text-sm font-bold text-neutral-900">{r.vehiculos}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
