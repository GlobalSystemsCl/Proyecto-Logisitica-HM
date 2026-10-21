'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Clock, Mail, MapPin, ShieldCheck, UserCheck, X } from 'lucide-react';
import { ROL_LABEL, type UserProfile, type UserRole } from '@/types/auth.types';
import type { Sucursal, Zona } from '@/types/sucursal.types';
import PanelAcciones from '@/components/PanelAcciones';
import AsignacionesFields from '@/components/AsignacionesUsuarioFields';
import ActivacionMasivaModal from '@/components/ActivacionMasivaModal';
import { approveUserAction, updateUserAction } from '@/app/actions/users.actions';
import { sucursalesOcupadasPorJefes, validarAsignacionesFormulario } from '@/lib/asignaciones';
import { recortar, LIMITE_PANEL_CUENTAS } from '@/lib/panel';
import { formatFecha } from '@/lib/fechas';

interface Props {
  /** Todos los usuarios: se usan para saber qué sucursales ya tienen jefe de local. */
  usuarios: UserProfile[];
  sucursales: Sucursal[];
  zonas: Zona[];
}

const ROLES: Array<{ valor: UserRole; descripcion: string }> = [
  { valor: 'ejecutivo', descripcion: 'Crea y sigue solicitudes de su sucursal' },
  { valor: 'jefe_local', descripcion: 'Aprueba, prioriza y recibe en sus sucursales' },
  { valor: 'logistica', descripcion: 'Programa y despacha los traslados de su zona' },
  { valor: 'operaciones', descripcion: 'Carga y mantiene el inventario de vehículos' },
  { valor: 'administrador', descripcion: 'Control total del sistema' },
];

const inputCls =
  'w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

/**
 * Cuentas autoregistradas que esperan activación. Activar obliga a elegir el
 * rol y a revisar sucursal, sucursales a cargo o zona antes de confirmar.
 */
export default function PanelCuentasPendientes({ usuarios, sucursales, zonas }: Props) {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  const [usuario, setUsuario] = useState<UserProfile | null>(null);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [rol, setRol] = useState<UserRole | ''>('');
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [sucursalesIds, setSucursalesIds] = useState<number[]>([]);
  const [zonasIds, setZonasIds] = useState<number[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fase F: activación masiva de las cuentas visibles.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [masiva, setMasiva] = useState(false);

  const pendientes = useMemo(
    () =>
      usuarios
        .filter((u) => u.aprobado === false)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [usuarios]
  );
  const lista = recortar(pendientes, LIMITE_PANEL_CUENTAS);
  const seleccionadas = lista.items.filter((u) => seleccion.has(u.id));
  const todasSeleccionadas = lista.items.length > 0 && seleccionadas.length === lista.items.length;

  function alternar(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarTodas() {
    setSeleccion(todasSeleccionadas ? new Set() : new Set(lista.items.map((u) => u.id)));
  }

  const jefes = useMemo(
    () => usuarios.map((u) => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), rol: u.rol, sucursal_id: u.sucursal_id, sucursales: u.sucursales })),
    [usuarios]
  );
  const ocupadas = useMemo(() => sucursalesOcupadasPorJefes(jefes, usuario?.id), [jefes, usuario]);

  const nombreSucursal = (id: number | null | undefined) =>
    id == null ? null : sucursales.find((s) => s.id === id)?.nombre ?? `Sucursal #${id}`;

  function abrir(u: UserProfile) {
    setUsuario(u);
    setNombre(u.nombre);
    setApellido(u.apellido);
    // El rol no se toma del registro: el administrador debe elegirlo.
    setRol('');
    setSucursalId(u.sucursal_id ?? null);
    setSucursalesIds((u.sucursales ?? []).map((s) => s.id).filter((id) => id !== u.sucursal_id));
    setZonasIds((u.zonas ?? []).map((z) => z.id));
    setConfirmado(false);
    setError(null);
  }

  function cerrar() {
    setUsuario(null);
    setError(null);
  }

  function cambiarRol(next: UserRole) {
    setRol(next);
    if (next !== 'logistica') setZonasIds([]);
    if (next !== 'jefe_local') setSucursalesIds([]);
    setConfirmado(false);
    setError(null);
  }

  function activar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!usuario) return;
    if (!rol) {
      setError('Debes asignar un rol antes de activar la cuenta.');
      return;
    }
    const errorAsignacion = validarAsignacionesFormulario(
      { rol, sucursal_id: sucursalId, sucursales_ids: sucursalesIds, zonas_ids: zonasIds },
      ocupadas,
      sucursales
    );
    if (errorAsignacion) {
      setError(errorAsignacion);
      return;
    }
    if (!confirmado) {
      setError('Confirma que revisaste la información de la cuenta.');
      return;
    }

    const destino = usuario;
    startTransition(async () => {
      const actualizado = await updateUserAction({
        userId: destino.id,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        rol,
        sucursal_id: sucursalId,
        sucursales_ids: rol === 'jefe_local' ? sucursalesIds : [],
        zonas_ids: rol === 'logistica' ? zonasIds : [],
      });
      if (!actualizado.success) {
        setError(actualizado.error || 'No se pudo guardar la información de la cuenta.');
        return;
      }
      const aprobado = await approveUserAction(destino.id);
      if (!aprobado.success) {
        setError(aprobado.error || 'Se guardaron los datos, pero no se pudo activar la cuenta.');
        return;
      }
      setFeedback({ tipo: 'success', mensaje: `Cuenta de ${destino.email} activada como ${ROL_LABEL[rol]}.` });
      setUsuario(null);
      router.refresh();
    });
  }

  // Resumen que el administrador corrobora antes de activar.
  const resumen: Array<{ etiqueta: string; valor: string; falta?: boolean }> = [];
  if (rol) {
    resumen.push({ etiqueta: 'Rol', valor: ROL_LABEL[rol] });
    const base = nombreSucursal(sucursalId);
    if (rol === 'ejecutivo') {
      resumen.push({ etiqueta: 'Sucursal a la que pertenece', valor: base ?? 'Sin asignar', falta: !base });
    } else if (rol === 'jefe_local') {
      resumen.push({ etiqueta: 'Sucursal base', valor: base ?? 'Sin asignar', falta: !base });
      const total = (base ? 1 : 0) + sucursalesIds.length;
      const nombres = [base, ...sucursalesIds.map((id) => nombreSucursal(id))].filter(Boolean).join(', ');
      resumen.push({
        etiqueta: 'Sucursales a su cargo',
        valor: total > 0 ? `${total} · ${nombres}` : 'Ninguna',
        falta: total === 0,
      });
    } else if (rol === 'logistica') {
      resumen.push({ etiqueta: 'Sucursal base', valor: base ?? 'Sin asignar', falta: !base });
      const zona = zonas.find((z) => z.id === zonasIds[0])?.nombre;
      resumen.push({ etiqueta: 'Zona asignada', valor: zona ?? 'Sin asignar', falta: !zona });
    } else {
      resumen.push({ etiqueta: 'Sucursal', valor: base ?? 'Sin sucursal (opcional)' });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#1a2b4b] tracking-tight">Cuentas por activar</h2>
        <p className="text-sm text-neutral-500">Usuarios que se registraron y esperan que les asignes rol y sucursal.</p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
            feedback.tipo === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span className="flex-1">{feedback.mensaje}</span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {lista.items.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={todasSeleccionadas} onChange={alternarTodas} />
            Seleccionar todas las visibles
          </label>
          <button
            onClick={() => setMasiva(true)}
            disabled={seleccionadas.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Activar seleccionadas ({seleccionadas.length})
          </button>
        </div>
      )}

      <PanelAcciones
        titulo="Pendientes de activar"
        descripcion="Cuentas creadas desde el registro, aún sin acceso al sistema"
        icono={<UserCheck className="w-5 h-5 text-red-600" />}
        total={lista.total}
        restantes={lista.restantes}
        verTodasHref="/admin/usuarios"
        textoVacio="No hay cuentas pendientes de activar."
        tono="rojo"
      >
        {lista.items.map((u) => (
          <li key={u.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            {lista.items.length > 1 && (
              <input
                type="checkbox"
                checked={seleccion.has(u.id)}
                onChange={() => alternar(u.id)}
                aria-label={`Seleccionar ${u.email}`}
                className="shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">
                {u.nombre} {u.apellido}
              </p>
              <p className="text-xs text-neutral-500 truncate flex items-center gap-1">
                <Mail className="w-3 h-3 shrink-0" /> {u.email}
              </p>
              <p className="text-[11px] text-neutral-400 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {u.sucursal_nombre ?? nombreSucursal(u.sucursal_id) ?? 'Sin sucursal declarada'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Registrado {formatFecha(u.created_at)}
                </span>
              </p>
            </div>
            <button
              onClick={() => abrir(u)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Activar cuenta
            </button>
          </li>
        ))}
      </PanelAcciones>

      {masiva && (
        <ActivacionMasivaModal
          cuentas={seleccionadas}
          sucursales={sucursales}
          zonas={zonas}
          onCerrar={() => setMasiva(false)}
          onActivadas={() => setSeleccion(new Set())}
        />
      )}

      {usuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={cerrar}>
          <div
            className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Activar cuenta</h2>
                  <p className="text-xs text-neutral-500">Asigna el rol y corrobora la información antes de dar acceso</p>
                </div>
              </div>
              <button onClick={cerrar} className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={activar} className="p-6 space-y-5 overflow-y-auto">
              {/* Datos del registro */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-1.5 text-sm">
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Datos ingresados en el registro</p>
                <p className="flex items-center gap-2 text-neutral-800">
                  <Mail className="w-4 h-4 text-neutral-400" /> {usuario.email}
                </p>
                <p className="flex items-center gap-2 text-neutral-800">
                  <Building2 className="w-4 h-4 text-neutral-400" />
                  {usuario.sucursal_nombre ?? nombreSucursal(usuario.sucursal_id) ?? 'No indicó sucursal'}
                </p>
                <p className="flex items-center gap-2 text-neutral-500 text-xs">
                  <Clock className="w-4 h-4 text-neutral-400" /> Registrado el {formatFecha(usuario.created_at)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nombre *</label>
                  <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Apellido *</label>
                  <input required value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Rol obligatorio */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Rol a asignar *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLES.map((r) => (
                    <button
                      type="button"
                      key={r.valor}
                      onClick={() => cambiarRol(r.valor)}
                      aria-pressed={rol === r.valor}
                      className={`text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                        rol === r.valor
                          ? 'bg-neutral-900 border-neutral-900 text-white'
                          : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-900'
                      }`}
                    >
                      <p className="text-sm font-semibold">{ROL_LABEL[r.valor]}</p>
                      <p className={`text-[11px] ${rol === r.valor ? 'text-neutral-300' : 'text-neutral-500'}`}>{r.descripcion}</p>
                    </button>
                  ))}
                </div>
                {!rol && <p className="text-[11px] text-amber-700">Elige un rol para continuar.</p>}
              </div>

              {rol && (
                <AsignacionesFields
                  rol={rol}
                  sucursales={sucursales}
                  zonas={zonas}
                  ocupadas={ocupadas}
                  sucursalId={sucursalId}
                  onSucursalId={(id) => { setSucursalId(id); setConfirmado(false); }}
                  sucursalesIds={sucursalesIds}
                  onSucursalesIds={(ids) => { setSucursalesIds(ids); setConfirmado(false); }}
                  zonasIds={zonasIds}
                  onZonasIds={(ids) => { setZonasIds(ids); setConfirmado(false); }}
                  error={null}
                />
              )}

              {/* Resumen a corroborar */}
              {rol && (
                <div className="rounded-xl border-2 border-neutral-900 p-4 space-y-2">
                  <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Así quedará la cuenta</p>
                  <dl className="space-y-1.5">
                    {resumen.map((r) => (
                      <div key={r.etiqueta} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 text-sm">
                        <dt className="text-neutral-500 sm:w-48 shrink-0">{r.etiqueta}</dt>
                        <dd className={`font-semibold ${r.falta ? 'text-red-600' : 'text-neutral-900'}`}>{r.valor}</dd>
                      </div>
                    ))}
                  </dl>
                  <label className="flex items-start gap-2 pt-2 text-sm text-neutral-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmado}
                      onChange={(e) => setConfirmado(e.target.checked)}
                      className="mt-0.5"
                    />
                    Revisé el rol, la sucursal y las asignaciones de esta cuenta.
                  </label>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={cerrar}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !rol || !confirmado}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSubmitting ? 'Activando...' : 'Activar cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
