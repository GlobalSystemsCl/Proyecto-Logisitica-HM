'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Users, X } from 'lucide-react';
import { ROL_LABEL, type UserProfile, type UserRole } from '@/types/auth.types';
import type { Sucursal, Zona } from '@/types/sucursal.types';
import { approveUsersBulkAction } from '@/app/actions/users.actions';
import {
  ROLES_ACTIVACION_MASIVA,
  validarAsignacionMasiva,
  type SucursalMasiva,
} from '@/lib/activacionMasiva';

interface Props {
  cuentas: UserProfile[];
  sucursales: Sucursal[];
  zonas: Zona[];
  onCerrar: () => void;
  /** Se llama al cerrar después de activar, para limpiar la selección. */
  onActivadas: () => void;
}

interface Resultado {
  activadas: string[];
  fallidas: Array<{ email: string; error: string }>;
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

/**
 * Activa varias cuentas pendientes con un rol y sucursal en común (fase F).
 * Por defecto cada cuenta conserva la sucursal que declaró al registrarse.
 */
export default function ActivacionMasivaModal({ cuentas, sucursales, zonas, onCerrar, onActivadas }: Props) {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();
  const [rol, setRol] = useState<UserRole>('ejecutivo');
  const [sucursal, setSucursal] = useState<SucursalMasiva>('registro');
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const sinSucursal = sucursal === 'registro' ? cuentas.filter((c) => c.sucursal_id == null).length : 0;

  function activar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const asignacion = { rol, sucursal, zonaId };
    const errorAsignacion = validarAsignacionMasiva(asignacion, cuentas.length);
    if (errorAsignacion) {
      setError(errorAsignacion);
      return;
    }
    startTransition(async () => {
      const res = await approveUsersBulkAction(
        cuentas.map((c) => c.id),
        asignacion
      );
      if (!res.success) {
        setError(res.error ?? 'No se pudieron activar las cuentas.');
        return;
      }
      setResultado({ activadas: res.activadas, fallidas: res.fallidas });
    });
  }

  function cerrar() {
    if (resultado) {
      onActivadas();
      router.refresh();
    }
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={cerrar}>
      <div
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Activar {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'}</h2>
              <p className="text-xs text-neutral-500">Mismo rol y sucursal para todas las seleccionadas</p>
            </div>
          </div>
          <button onClick={cerrar} className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultado ? (
          <div className="p-6 space-y-4 overflow-y-auto">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              {resultado.activadas.length} cuenta{resultado.activadas.length === 1 ? '' : 's'} activada{resultado.activadas.length === 1 ? '' : 's'} como {ROL_LABEL[rol]}.
            </p>
            {resultado.fallidas.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-1 text-xs text-red-800">
                <p className="font-semibold">No se activaron {resultado.fallidas.length}:</p>
                <ul className="space-y-0.5">
                  {resultado.fallidas.map((f) => (
                    <li key={f.email}>
                      <span className="font-semibold">{f.email}</span>: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button onClick={cerrar} className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer">
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={activar} className="p-6 space-y-5 overflow-y-auto">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 max-h-32 overflow-y-auto text-xs text-neutral-700 space-y-0.5">
              {cuentas.map((c) => (
                <p key={c.id} className="truncate">
                  <span className="font-semibold">{c.nombre} {c.apellido}</span> · {c.email}
                  {c.sucursal_nombre ? ` · ${c.sucursal_nombre}` : ''}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rol *</label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES_ACTIVACION_MASIVA.map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => { setRol(r); setConfirmado(false); setError(null); }}
                    aria-pressed={rol === r}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${
                      rol === r ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-900'
                    }`}
                  >
                    {ROL_LABEL[r]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500">Jefe de Local y Administrador se activan de a una cuenta.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Sucursal *</label>
              <select
                value={String(sucursal)}
                onChange={(e) => { setSucursal(e.target.value === 'registro' ? 'registro' : Number(e.target.value)); setConfirmado(false); }}
                className={inputCls}
              >
                <option value="registro">Mantener la que indicó cada uno al registrarse</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre ?? `Sucursal #${s.id}`}</option>
                ))}
              </select>
              {sinSucursal > 0 && rol !== 'operaciones' && (
                <p className="text-[11px] text-amber-700">
                  {sinSucursal} cuenta{sinSucursal === 1 ? '' : 's'} no indicó sucursal y no se podrá{sinSucursal === 1 ? '' : 'n'} activar así.
                </p>
              )}
            </div>

            {rol === 'logistica' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Zona *</label>
                <select
                  value={zonaId ?? ''}
                  onChange={(e) => { setZonaId(e.target.value ? Number(e.target.value) : null); setConfirmado(false); }}
                  className={inputCls}
                >
                  <option value="">Elige la zona</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>{z.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5" />
              Revisé las cuentas seleccionadas y les doy acceso como {ROL_LABEL[rol]}.
            </label>

            {error && (
              <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">{error}</div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={cerrar} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !confirmado}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmitting ? 'Activando...' : `Activar ${cuentas.length}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
