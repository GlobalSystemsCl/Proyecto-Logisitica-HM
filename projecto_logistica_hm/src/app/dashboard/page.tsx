import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  Users,
  Car,
  FileText,
  Building2,
  Truck,
  History,
  LogOut,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/login?error=account_deactivated');
  }

  if (profile.requiere_cambio_clave) {
    redirect('/establecer-clave');
  }

  const isAdmin = profile.rol === 'administrador';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight">H.Motores</span>
              <span className="text-[11px] text-slate-400 block -mt-1 font-mono">
                Logística & Traslado de Vehículos
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-white">
                {profile.nombre} {profile.apellido}
              </p>
              <p className="text-[10px] text-blue-400 uppercase font-mono tracking-wider">
                Rol: {profile.rol}
              </p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors border border-slate-800 cursor-pointer"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900/50 border border-blue-800/40 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950/80 border border-blue-700/60 text-blue-300">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Sesión Activa y Segura</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Bienvenido, {profile.nombre} {profile.apellido}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Plataforma interna para la gestión, control operativo y trazabilidad del traslado de vehículos entre sucursales de H.Motores.
            </p>
          </div>
        </div>

        {/* System Modules Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>Módulos de la Plataforma</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Admin User Management */}
            {isAdmin && (
              <Link
                href="/admin/usuarios"
                className="group bg-slate-900/80 border border-purple-900/50 hover:border-purple-600/80 rounded-2xl p-6 transition-all duration-200 hover:shadow-xl hover:shadow-purple-900/20 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white group-hover:text-purple-300 transition-colors">
                        Gestión de Usuarios
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                        Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Creación de cuentas, envío de invitaciones por correo y control de activación/desactivación.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-purple-400 group-hover:text-purple-300">
                  <span>Administrar colaboradores</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            )}

            {/* Vehicle Management */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between opacity-85">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Gestión de Vehículos</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Incorporación manual de vehículos al inventario interno, sucursal asignada y validación de datos.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span>Próximo módulo operativo</span>
              </div>
            </div>

            {/* Requests Management */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between opacity-85">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Gestión de Solicitudes</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Flujo de estados: Creada, Priorizada, Asignada, Despachada y Finalizada formalmente.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span>Próximo módulo operativo</span>
              </div>
            </div>

            {/* Branches Management */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between opacity-85">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Gestión de Sucursales</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Control de sucursales origen/destino y verificación de disponibilidad de estacionamiento.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span>Próximo módulo operativo</span>
              </div>
            </div>

            {/* Logistics Management */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between opacity-85">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Gestión Logística</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Calendarización de traslados, fecha tentativa, despacho y confirmación de entrega en destino.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span>Próximo módulo operativo</span>
              </div>
            </div>

            {/* Traceability & History */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between opacity-85">
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Historial y Trazabilidad</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Registro inmutable de acciones, responsables y fechas para auditoría operativa continua.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span>Próximo módulo operativo</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
