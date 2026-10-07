import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { decidirAcceso, type EstadoCuenta } from '@/lib/auth/acceso';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Estado real de la cuenta desde public.usuario (la policy SELECT permite
  // leer la fila propia). No se usa user_metadata: lo controla el usuario.
  let cuenta: EstadoCuenta | null = null;
  if (user) {
    const { data } = await supabase
      .from('usuario')
      .select('activo, aprobado, requiere_cambio_clave')
      .eq('id', user.id)
      .maybeSingle();
    cuenta = (data as EstadoCuenta | null) ?? null;
  }

  const decision = decidirAcceso(path, Boolean(user), cuenta);

  if (decision.cerrarSesion) {
    await supabase.auth.signOut();
  }

  if (decision.accion === 'continuar') {
    return supabaseResponse;
  }

  const url = request.nextUrl.clone();
  url.pathname = decision.destino;
  url.search = '';
  if (decision.error) url.searchParams.set('error', decision.error);

  const redirect = NextResponse.redirect(url);
  // Conservar las cookies de sesión que haya renovado o borrado Supabase.
  supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
