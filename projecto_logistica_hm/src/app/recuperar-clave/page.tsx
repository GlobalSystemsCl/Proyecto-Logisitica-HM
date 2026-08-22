'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/actions/auth.actions';
import { KeyRound, Mail, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';

export default function RecuperarClavePage() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, null);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-neutral-100 px-4 py-12 sm:px-6 lg:px-8 text-neutral-900">
      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Header / Icon */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900 text-white font-bold text-2xl tracking-wider">
            <KeyRound className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Recuperar Contraseña
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Ingresa tu correo corporativo para recibir un enlace de restablecimiento seguro
            </p>
          </div>
        </div>

        {/* Card Form */}
        <div className="bg-white border border-neutral-200 shadow-xl rounded-2xl p-8 space-y-6">
          {/* Feedback Success */}
          {state?.success && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-neutral-900 border border-neutral-900 rounded-xl text-white text-sm">
                <CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Enlace enviado</span>
                  <span className="text-xs leading-relaxed opacity-90">{state.message}</span>
                </div>
              </div>
              <Link
                href="/login"
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-neutral-900 bg-white hover:bg-neutral-100 transition-colors border border-neutral-300"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al inicio de sesión</span>
              </Link>
            </div>
          )}

          {/* Feedback Error */}
          {!state?.success && state?.error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block">No se pudo enviar el correo</span>
                <span className="text-xs leading-relaxed opacity-90">{state.error}</span>
              </div>
            </div>
          )}

          {!state?.success && (
            <form action={formAction} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  Correo Electrónico Registrado
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="usuario@hmotores.cl"
                    className="block w-full pl-10 pr-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 group"
              >
                {isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enviando enlace seguro...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar Enlace de Recuperación</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver al Inicio de Sesión</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
