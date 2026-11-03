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
  let lecturaFallida = false;
  if (user) {
    const { data, error } = await supabase
      .from('usuario')
      .select('activo, aprobado, requiere_cambio_clave')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      lecturaFallida = true;
      console.warn('[sesion] No se pudo leer el estado de la cuenta; se deja pasar sin cerrar sesión.', {
        usuario: user.id,
        ruta: path,
        error: error.message,
      });
    }
    cuenta = (data as EstadoCuenta | null) ?? null;
  }

  const decision = decidirAcceso(path, Boolean(user), cuenta, lecturaFallida);

  if (decision.cerrarSesion) {
    // Motivo en el log para poder confirmar en producción por qué se cerró.
    console.warn('[sesion] Cierre de sesión por estado de la cuenta.', {
      usuario: user?.id,
      ruta: path,
      motivo: decision.accion === 'redirigir' ? decision.error : 'cuenta_bloqueada',
    });
    // Solo en este navegador: el alcance global cerraba la sesión del usuario
    // en todos sus dispositivos.
    await supabase.auth.signOut({ scope: 'local' });
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
