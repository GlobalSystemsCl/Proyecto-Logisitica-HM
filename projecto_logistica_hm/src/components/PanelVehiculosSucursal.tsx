'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car, Download, Loader2, Truck, X } from 'lucide-react';
import { getVehiculosDeSucursalAction } from '@/app/actions/sucursales.actions';
import { descargarExcel } from '@/lib/excel';
import { formatFecha, hoyISO } from '@/lib/fechas';
import { formatearPatente } from '@/lib/patente';
import { filasExcelTransito, type FilaTransito } from '@/lib/transito';
import type { SlotSucursal } from '@/components/TablaSlots';
import type { VehiculoEnSucursal } from '@/types/vehiculo.types';

interface Props {
  sucursal: SlotSucursal;
  onCerrar: () => void;
}

type Datos = { enSucursal: VehiculoEnSucursal[]; enCamino: FilaTransito[] };

/**
 * R4 (2026-11-11): desde Slots, los vehículos que están en la sucursal
 * (disponibles o reservados) y los que van en camino hacia ella. Exporta a
 * Excel en dos hojas.
 */
export default function PanelVehiculosSucursal({ sucursal, onCerrar }: Props) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombre = sucursal.nombre ?? `Sucursal ${sucursal.id}`;

  useEffect(() => {
    let vigente = true;
    void getVehiculosDeSucursalAction(sucursal.id).then((res) => {
      if (!vigente) return;
      if (res.success) setDatos({ enSucursal: res.enSucursal, enCamino: res.enCamino });
      else setError(res.error);
    });
    return () => {
      vigente = false;
    };
  }, [sucursal.id]);

  function exportar() {
    if (!datos) return;
    descargarExcel(`vehiculos_${sucursal.id}_${hoyISO()}.xlsx`, [
      {
        nombre: 'En la sucursal',
        filas: datos.enSucursal.map((v) => ({
          Chasis: v.chasis,
          Patente: v.patente ?? '',
          IDV: v.idv ?? '',
          Marca: v.marca,
          Modelo: v.modelo,
          Color: v.color ?? '',
          Estado: v.reservado ? 'Reservado' : 'Disponible',
        })),
        encabezados: ['Chasis', 'Patente', 'IDV', 'Marca', 'Modelo', 'Color', 'Estado'],
      },
      { nombre: 'En camino', filas: filasExcelTransito(datos.enCamino) },
    ]);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-vehiculos-sucursal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 p-5 border-b border-neutral-200">
          <div>
            <h2 id="titulo-vehiculos-sucursal" className="text-base font-bold text-neutral-900">
              Vehículos de {nombre}
            </h2>
            {datos && (
              <p className="text-xs text-neutral-500">
                {datos.enSucursal.length} en la sucursal · {datos.enCamino.length} en camino hacia ella
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportar}
              disabled={!datos}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-900 border border-neutral-300 rounded-lg hover:bg-neutral-100 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
            <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!datos && !error && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          )}
          {datos && (
            <>
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" /> En la sucursal
                </h3>
                {datos.enSucursal.length === 0 ? (
                  <p className="text-sm text-neutral-400">No hay vehículos en esta sucursal.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                    {datos.enSucursal.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-neutral-700 break-all">{v.chasis}</span>
                        <span className="text-neutral-900">
                          {v.marca} {v.modelo}
                          {v.color ? ` · ${v.color}` : ''}
                        </span>
                        <span
                          className={`ml-auto px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                            v.reservado ? 'bg-neutral-900 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {v.reservado ? 'Reservado' : 'Disponible'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> En camino hacia la sucursal
                </h3>
                {datos.enCamino.length === 0 ? (
                  <p className="text-sm text-neutral-400">No hay vehículos en camino.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                    {datos.enCamino.map((f) => (
                      <li key={f.clave} className="px-3 py-2 text-sm">
                        <p className="text-neutral-900">
                          <span className="font-mono text-xs">{f.chasis}</span> · {f.vehiculo} · desde {f.origen}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {f.codigo} · despachado {f.fechaDespacho ? formatFecha(f.fechaDespacho) : '—'}
                          {f.guia ? ` · Guía ${f.guia}` : ''}
                          {f.patenteCamion ? ` · Camión ${formatearPatente(f.patenteCamion)}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
