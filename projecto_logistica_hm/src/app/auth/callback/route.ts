import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/establecer-clave';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');
  redirectTo.searchParams.delete('code');
  redirectTo.searchParams.delete('next');

  const supabase = await createClient();

  // 1. Si viene con token_hash (enlaces de invitación y recuperación estándar)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error('Error en verifyOtp:', error.message);
  }

  // 2. Si viene con código PKCE (exchangeCodeForSession)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error('Error en exchangeCodeForSession:', error.message);
  }

  // Si falló o el token expiró, redirigir a login con aviso claro
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '?error=enlace_expirado';
  return NextResponse.redirect(loginUrl);
}
