'use client';

import { useActionState, useState } from 'react';
import { updatePasswordAction } from '@/app/actions/auth.actions';
import { Lock, KeyRound, Eye, EyeOff, AlertCircle, Check, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function EstablecerClavePage() {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = hasMinLength && passwordsMatch;

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-4 py-12 sm:px-6 lg:px-8 text-slate-100">
      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 text-white font-bold text-2xl tracking-wider">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Establecer Contraseña
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Crea tu contraseña personal de acceso para la plataforma H.Motores
            </p>
          </div>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 shadow-2xl rounded-2xl p-8 space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <p className="text-xs text-slate-400">
              Por tu seguridad, esta contraseña solo es conocida por ti y reemplaza cualquier acceso provisorio.
            </p>
          </div>

          {state?.error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">Error al guardar</span>
                <span className="text-xs leading-relaxed opacity-90">{state.error}</span>
              </div>
            </div>
          )}

          <form action={formAction} className="space-y-5">
            {/* Nueva Contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Nueva Contraseña
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirmar Contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider"
              >
                Confirmar Contraseña
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Requirements Checklist */}
            <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {hasMinLength ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                )}
                <span className={hasMinLength ? 'text-emerald-300' : ''}>
                  Mínimo 8 caracteres
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hasNumber ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                )}
                <span className={hasNumber ? 'text-emerald-300' : ''}>
                  Contiene al menos un número (recomendado)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {passwordsMatch ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                )}
                <span className={passwordsMatch ? 'text-emerald-300' : ''}>
                  Las contraseñas coinciden
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending || !isValid}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/30 transition-all duration-150"
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Guardando contraseña...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Contraseña e Ingresar</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
