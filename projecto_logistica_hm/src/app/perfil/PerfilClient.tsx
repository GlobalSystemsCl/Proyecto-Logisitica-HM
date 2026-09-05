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
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="h-24 bg-neutral-900 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.35),transparent_55%)]" />
        </div>
        <div className="px-6 sm:px-8 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8">
            <div className="w-20 h-20 rounded-full bg-neutral-200 border-4 border-white flex items-center justify-center shrink-0 shadow-md">
              <UserRound className="w-10 h-10 text-neutral-500" />
            </div>
            <div className="flex-1 sm:pb-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                  {profile.nombre} {profile.apellido}
                </h1>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white border border-neutral-900">
                  {ROL_LABEL[profile.rol]}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{profile.email}</p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                profile.activo
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${profile.activo ? 'bg-green-500' : 'bg-red-500'}`} />
              {profile.activo ? 'Cuenta activa' : 'Cuenta desactivada'}
            </span>
          </div>
        </div>
      </div>

      {/* Datos de la cuenta (solo lectura) */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-7 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
            <IdCard className="w-4 h-4 text-neutral-600" />
          </div>
          <h2 className="text-sm font-bold text-neutral-900">Datos de la cuenta</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> Correo electrónico
            </p>
            <p className="text-sm text-neutral-900 font-medium break-all">{profile.email}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Sucursal
            </p>
            <p className="text-sm text-neutral-900 font-medium">
              {profile.sucursal_nombre || (profile.sucursal_id ? `#${profile.sucursal_id}` : 'Sin asignar')}
            </p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Rol del sistema
            </p>
            <p className="text-sm text-neutral-900 font-medium">{ROL_LABEL[profile.rol]}</p>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
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
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
            <UserRound className="w-4 h-4 text-neutral-600" />
          </div>
          <h2 className="text-sm font-bold text-neutral-900">Editar mi perfil</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-5">
          Para modificar el correo, el rol o la sucursal, contacta al administrador del sistema.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Nombre *
            </label>
            <input
              name="nombre"
              type="text"
              required
              defaultValue={profile.nombre}
              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
              Apellido *
            </label>
            <input
              name="apellido"
              type="text"
              required
              defaultValue={profile.apellido}
              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Teléfono de contacto
            </label>
            <input
              name="telefono"
              type="tel"
              maxLength={30}
              placeholder="+56 9 1234 5678"
              defaultValue={profile.telefono ?? ''}
              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <p className="text-[11px] text-neutral-400">
              Aparecerá en el detalle de solicitudes como contacto responsable.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}