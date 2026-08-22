'use client';

import { useActionState, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/app/actions/auth.actions';
import { Shield, Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'enlace_expirado' || err === 'auth_callback_failed') {
      setUrlError('El enlace de acceso ha expirado o ya fue utilizado. Por favor solicita uno nuevo al administrador.');
    } else if (err === 'account_deactivated') {
      setUrlError('Tu cuenta se encuentra desactivada por el administrador.');
    } else if (err === 'unauthorized') {
      setUrlError('No tienes permisos suficientes para acceder a esta sección.');
    }

    // Verificar si en el hash del navegador vino un error de OTP expirado
    if (typeof window !== 'undefined' && window.location.hash.includes('error=')) {
      if (window.location.hash.includes('otp_expired') || window.location.hash.includes('expired')) {
        setUrlError('El enlace de invitación o recuperación ha expirado. Por favor solicita un nuevo enlace.');
      }
    }
  }, [searchParams]);

  const activeError = state?.error || urlError;

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4 py-12 sm:px-6 lg:px-8 text-slate-100">
      {/* Decorative ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Header / Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-lg shadow-blue-500/20 text-white font-bold text-2xl tracking-wider">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              H.Motores
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium">
              Sistema de Gestión y Logística de Vehículos
            </p>
          </div>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 shadow-2xl rounded-2xl p-8 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              Inicio de Sesión Corporativo
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Acceso restringido a colaboradores autorizados
            </p>
          </div>

          {/* Feedback error alert */}
          {activeError && (
            <div className="flex items-start gap-3 p-3.5 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-sm animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Aviso de seguridad</span>
                <span className="text-xs leading-relaxed opacity-90">{activeError}</span>
              </div>
            </div>
          )}

          <form action={formAction} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Correo Electrónico
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="usuario@hmotores.cl o gmail.com"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  Contraseña
                </label>
                <Link
                  href="/recuperar-clave"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 transition-all duration-150 group cursor-pointer"
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la Plataforma</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Security notice */}
          <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-800/80 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>Conexión cifrada y protegida contra intentos de fuerza bruta</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500">
          ¿No tienes cuenta? Solicita el alta a un Administrador de H.Motores.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginForm />
    </Suspense>
  );
}
