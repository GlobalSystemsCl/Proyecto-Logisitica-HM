'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { UserProfile } from '@/types/auth.types';
import type { Sucursal, Zona } from '@/types/sucursal.types';
import { importUsuariosAction, type ResultadoFilaImportacion } from '@/app/actions/users.actions';
import { descargarExcel } from '@/lib/excel';
import { sucursalesOcupadasPorJefes } from '@/lib/asignaciones';
import { textoDominios } from '@/lib/dominios';
import {
  COLUMNAS_PLANTILLA,
  MAX_FILAS_IMPORTACION,
  enLotes,
  filasDesdeExcel,
  filasEjemploPlantilla,
  validarFilasImportacion,
  type FilaPlantilla,
} from '@/lib/importUsuarios';

interface Props {
  usuarios: UserProfile[];
  sucursales: Sucursal[];
  zonas: Zona[];
  dominios: string[] | null;
  onCerrar: () => void;
}

/**
 * Carga masiva de usuarios desde Excel (fase F): plantilla, vista previa con
 * los errores de cada fila y creación por lotes. Cada cuenta recibe sus
 * credenciales por correo, igual que al crearla de a una.
 */
export default function CargaMasivaUsuarios({ usuarios, sucursales, zonas, dominios, onCerrar }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<FilaPlantilla[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoFilaImportacion[] | null>(null);

  const validadas = useMemo(
    () =>
      validarFilasImportacion(filas, {
        sucursales,
        zonas,
        emailsExistentes: new Set(usuarios.map((u) => u.email.toLowerCase())),
        sucursalesConJefe: sucursalesOcupadasPorJefes(
          usuarios.map((u) => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), rol: u.rol, sucursal_id: u.sucursal_id, sucursales: u.sucursales }))
        ),
        dominios,
      }),
    [filas, usuarios, sucursales, zonas, dominios]
  );
  const validas = validadas.filter((f) => f.errores.length === 0);
  const conErrores = validadas.length - validas.length;
  const importando = progreso !== null && resultados === null;

  function descargarPlantilla() {
    descargarExcel('plantilla_usuarios.xlsx', [
      { nombre: 'Usuarios', filas: filasEjemploPlantilla(sucursales[0]?.nombre ?? '', zonas[0]?.nombre ?? '') },
      {
        nombre: 'Opciones',
        filas: [
          ...['Ejecutivo', 'Jefe de Local', 'Logística', 'Operaciones'].map((r) => ({ Tipo: 'Rol', Valor: r })),
          ...sucursales.map((s) => ({ Tipo: 'Sucursal', Valor: s.nombre ?? String(s.id) })),
          ...zonas.map((z) => ({ Tipo: 'Zona', Valor: z.nombre })),
        ],
      },
    ]);
  }

  async function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setArchivo(file.name);
    setErrorArchivo(null);
    setFilas([]);
    setLeyendo(true);
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = libro.Sheets[libro.SheetNames[0] ?? ''];
      if (!hoja) {
        setErrorArchivo('El archivo no tiene hojas.');
        return;
      }
      const leidas = filasDesdeExcel(XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { raw: false, defval: '' }));
      if (leidas.length === 0) {
        setErrorArchivo(`No se encontraron filas. Usa la plantilla (columnas: ${COLUMNAS_PLANTILLA.join(', ')}).`);
        return;
      }
      if (leidas.length > MAX_FILAS_IMPORTACION) {
        setErrorArchivo(`El archivo tiene ${leidas.length} filas. El máximo por carga es ${MAX_FILAS_IMPORTACION}.`);
        return;
      }
      setFilas(leidas);
    } catch {
      setErrorArchivo('No se pudo leer el archivo. Verifica que sea un .xlsx o .xls válido.');
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    const aCrear = filas.filter((f) => validas.some((v) => v.fila === f.fila));
    const lotes = enLotes(aCrear);
    const acumulados: ResultadoFilaImportacion[] = [];
    setProgreso({ hechas: 0, total: aCrear.length });
    for (const lote of lotes) {
      const res = await importUsuariosAction(lote);
      if (res.success) {
        acumulados.push(...res.resultados);
      } else {
        acumulados.push(...lote.map((f) => ({ fila: f.fila, email: f.email, ok: false, error: res.error ?? 'Error al importar.' })));
      }
      setProgreso({ hechas: acumulados.length, total: aCrear.length });
    }
    setResultados(acumulados);
  }

  function cerrar() {
    if (importando) return;
    if (resultados?.some((r) => r.ok)) router.refresh();
    onCerrar();
  }

  const creadas = resultados?.filter((r) => r.ok) ?? [];
  const fallidas = resultados?.filter((r) => !r.ok) ?? [];
  const sinCorreo = creadas.filter((r) => r.tempPassword);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={cerrar}>
      <div
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Carga masiva de usuarios</h2>
              <p className="text-xs text-neutral-500">
                Hasta {MAX_FILAS_IMPORTACION} cuentas por archivo. Cada una recibe sus credenciales por correo.
                {dominios ? ` Solo correos ${textoDominios(dominios)}.` : ''}
              </p>
            </div>
          </div>
          <button onClick={cerrar} disabled={importando} className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer disabled:opacity-30" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {resultados ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> {creadas.length} cuenta{creadas.length === 1 ? '' : 's'} creada{creadas.length === 1 ? '' : 's'}.
              </p>
              {sinCorreo.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">No se pudo enviar el correo a {sinCorreo.length}. Entrégales estas contraseñas provisorias:</p>
                  <ul className="font-mono space-y-0.5">
                    {sinCorreo.map((r) => (
                      <li key={r.fila}>{r.email}: {r.tempPassword}</li>
                    ))}
                  </ul>
                </div>
              )}
              {fallidas.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                  <p className="font-semibold">No se crearon {fallidas.length}:</p>
                  <ul className="space-y-0.5">
                    {fallidas.map((r) => (
                      <li key={r.fila}>Fila {r.fila} · <span className="font-semibold">{r.email || 'sin correo'}</span>: {r.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={descargarPlantilla}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-neutral-300 hover:border-neutral-900 rounded-xl cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Descargar plantilla
                </button>
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={leyendo || importando}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Elegir archivo
                </button>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={leerArchivo} className="hidden" />
                {archivo && <span className="text-xs text-neutral-500">{archivo}</span>}
              </div>
              <p className="text-xs text-neutral-500">
                Columnas: {COLUMNAS_PLANTILLA.join(', ')}. La sucursal y la zona se escriben como en la hoja &quot;Opciones&quot; de la plantilla.
                La zona solo se usa para Logística. Un Jefe de Local queda a cargo de la sucursal indicada.
              </p>

              {errorArchivo && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {errorArchivo}
                </div>
              )}

              {validadas.length > 0 && (
                <>
                  <p className="text-sm">
                    <span className="font-semibold text-emerald-700">{validas.length} lista{validas.length === 1 ? '' : 's'} para crear</span>
                    {conErrores > 0 && <span className="font-semibold text-red-700"> · {conErrores} con errores (no se crearán)</span>}
                  </p>
                  <div className="border border-neutral-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider">
                        <tr>
                          <th className="py-2 px-3">Fila</th>
                          <th className="py-2 px-3">Nombre</th>
                          <th className="py-2 px-3">Correo</th>
                          <th className="py-2 px-3">Rol</th>
                          <th className="py-2 px-3">Sucursal / zona</th>
                          <th className="py-2 px-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {validadas.map((v, i) => (
                          <tr key={v.fila} className={v.errores.length > 0 ? 'bg-red-50/50' : ''}>
                            <td className="py-2 px-3 text-neutral-400">{v.fila}</td>
                            <td className="py-2 px-3">{v.nombre} {v.apellido}</td>
                            <td className="py-2 px-3">{v.email}</td>
                            <td className="py-2 px-3">{filas[i]?.rol}</td>
                            <td className="py-2 px-3">{[filas[i]?.sucursal, filas[i]?.zona].filter(Boolean).join(' · ')}</td>
                            <td className="py-2 px-3">
                              {v.errores.length === 0 ? (
                                <span className="text-emerald-700 font-semibold">OK</span>
                              ) : (
                                <span className="text-red-700">{v.errores.join(' ')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 shrink-0">
          {progreso && !resultados && (
            <span className="text-xs text-neutral-500 mr-auto">Creando cuentas… {progreso.hechas} de {progreso.total}</span>
          )}
          {resultados ? (
            <button onClick={cerrar} className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer">
              Listo
            </button>
          ) : (
            <>
              <button onClick={cerrar} disabled={importando} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={importar}
                disabled={validas.length === 0 || importando}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Crear {validas.length} cuenta{validas.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
