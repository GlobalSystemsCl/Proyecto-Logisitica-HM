'use client';

import { useActionState } from 'react';
import {
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  CalendarDays,
  UserRound,
  Save,
  CheckCircle2,
  AlertCircle,
  IdCard,
  UserCog,
  PencilLine,
} from 'lucide-react';
import { updateProfileAction, UpdateProfileState } from '@/app/actions/auth.actions';
import { ROL_LABEL, UserRole } from '@/types/auth.types';
import { formatFechaLarga } from '@/lib/fechas';

interface PerfilClientProps {
  profile: {
    id: string;
    email: string;
    nombre: string;
    apellido: string;
    rol: UserRole;
    telefono: string | null;
    sucursal_id: number | null;
    sucursal_nombre: string | null;
    activo: boolean;
    created_at: string;
  };
}

const initialState: UpdateProfileState = {};

export default function PerfilClient({ profile }: PerfilClientProps) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  const iniciales = `${profile.nombre.charAt(0)}${profile.apellido.charAt(0)}`.toUpperCase();

  return (
    <div className="space-y-6">
      {/* Feedback */}
      {state.message && state.success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2.5 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
          <span>{state.message}</span>
        </div>
      )}
      {state.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{state.error}</span>
        </div>
      )}

      {/* Profile hero */}
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-neutral-900 flex items-center justify-center text-white font-bold text-2xl uppercase shrink-0 shadow-md">
            {iniciales || <UserRound className="w-9 h-9 text-neutral-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                {profile.nombre} {profile.apellido}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white">
                <ShieldCheck className="w-3 h-3" />
                {ROL_LABEL[profile.rol]}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1 truncate">{profile.email}</p>
            <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {profile.sucursal_nombre || (profile.sucursal_id ? `Sucursal #${profile.sucursal_id}` : 'Sin sucursal asignada')}
              </span>
            </p>
          </div>

          <span
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shrink-0 ${
              profile.activo
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${profile.activo ? 'bg-green-500' : 'bg-red-500'}`} />
            {profile.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-neutral-100 divide-x divide-y sm:divide-y-0 divide-neutral-100">
          <div className="px-6 py-4">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">Sucursal</p>
            <p className="text-sm font-semibold text-neutral-900 truncate">
              {profile.sucursal_nombre || (profile.sucursal_id ? `#${profile.sucursal_id}` : '—')}
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">Teléfono</p>
            <p className="text-sm font-semibold text-neutral-900 truncate">{profile.telefono || 'Sin registrar'}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">Rol</p>
            <p className="text-sm font-semibold text-neutral-900 truncate">{ROL_LABEL[profile.rol]}</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">Miembro desde</p>
            <p className="text-sm font-semibold text-neutral-900 truncate">{formatFechaLarga(profile.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Datos de la cuenta (solo lectura) */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-7 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
            <IdCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Datos de la cuenta</h2>
            <p className="text-xs text-neutral-500">Información registrada por el administrador</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Correo electrónico
            </p>
            <p className="text-sm text-neutral-900 font-medium break-all">{profile.email}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Sucursal
            </p>
            <p className="text-sm text-neutral-900 font-medium">
              {profile.sucursal_nombre || (profile.sucursal_id ? `Sucursal #${profile.sucursal_id}` : 'Sin asignar')}
            </p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Rol del sistema
            </p>
            <p className="text-sm text-neutral-900 font-medium">{ROL_LABEL[profile.rol]}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Miembro desde
            </p>
            <p className="text-sm text-neutral-900 font-medium">{formatFechaLarga(profile.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Datos editables */}
      <form
        action={formAction}
        className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-7 shadow-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center">
            <UserCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Editar mi perfil</h2>
            <p className="text-xs text-neutral-500">
              Para modificar el correo, el rol o la sucursal, contacta al administrador del sistema.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          <div className="space-y-1.5">
            <label htmlFor="perfil-nombre" className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Nombre *
            </label>
            <div className="relative">
              <UserRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="perfil-nombre"
                name="nombre"
                type="text"
                required
                defaultValue={profile.nombre}
                className="w-full pl-10 pr-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="perfil-apellido" className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Apellido *
            </label>
            <div className="relative">
              <UserRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="perfil-apellido"
                name="apellido"
                type="text"
                required
                defaultValue={profile.apellido}
                className="w-full pl-10 pr-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="perfil-telefono" className="text-xs font-semibold text-neutral-600 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Teléfono de contacto
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="perfil-telefono"
                name="telefono"
                type="tel"
                maxLength={30}
                placeholder="+56 9 1234 5678"
                defaultValue={profile.telefono ?? ''}
                className="w-full pl-10 pr-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <PencilLine className="w-3 h-3" />
              Aparecerá en el detalle de solicitudes como contacto responsable.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-5 border-t border-neutral-200">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}