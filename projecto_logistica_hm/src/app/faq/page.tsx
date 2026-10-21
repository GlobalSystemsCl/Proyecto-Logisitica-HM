import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';
import { HelpCircle, ChevronRight, Circle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { ROL_LABEL } from '@/types/auth.types';
import { ETIQUETA_VISTA, gruposFaq, vistaDesdeParam } from '@/config/faq';
import { getSoporteEmail } from '@/lib/soporte';

export const dynamic = 'force-dynamic';

/**
 * Preguntas frecuentes (fase H): solo las del rol del usuario, agrupadas por
 * pantalla. `?vista=` (lo usa el botón de ayuda) pone primero las de esa
 * pantalla y las deja abiertas. El contenido está en `src/config/faq.ts`.
 */
export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const vista = vistaDesdeParam((await searchParams).vista);
  const grupos = gruposFaq(profile.rol, vista);
  const actual = vista && grupos[0]?.vista === vista ? grupos[0] : null;
  const soporte = getSoporteEmail();

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        usuarioId={profile.id}
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <header className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-900 text-white mb-4">
              <HelpCircle className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold text-neutral-900">Preguntas Frecuentes</h1>
            <p className="text-neutral-500 text-sm mt-2">
              {actual
                ? `Ayuda de la pantalla "${ETIQUETA_VISTA[actual.vista]}" para tu rol (${ROL_LABEL[profile.rol]}).`
                : `Respuestas para tu rol (${ROL_LABEL[profile.rol]}), ordenadas por pantalla.`}
            </p>
          </header>

          {grupos.length > 1 && (
            <nav aria-label="Pantallas" className="flex flex-wrap justify-center gap-2">
              {grupos.map((g) => (
                <a
                  key={g.vista}
                  href={`#${g.vista}`}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${
                    actual?.vista === g.vista
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-900'
                  }`}
                >
                  {g.titulo}
                </a>
              ))}
            </nav>
          )}

          {grupos.map((grupo) => {
            const esActual = actual?.vista === grupo.vista;
            return (
              <section
                key={grupo.vista}
                id={grupo.vista}
                className={`bg-white border rounded-2xl overflow-hidden shadow-sm scroll-mt-6 ${
                  esActual ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200'
                }`}
              >
                <h2 className="px-5 py-3.5 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                  <Circle className="w-3 h-3 text-neutral-400" />
                  {grupo.titulo}
                  {esActual && <span className="ml-auto normal-case tracking-normal text-neutral-900">Esta pantalla</span>}
                </h2>
                <div className="divide-y divide-neutral-100">
                  {grupo.preguntas.map((item) => (
                    <details key={item.pregunta} open={esActual} className="group px-5 py-4">
                      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm font-semibold text-neutral-900 hover:text-neutral-600 transition-colors">
                        {item.pregunta}
                        <ChevronRight className="w-4 h-4 text-neutral-400 group-open:rotate-90 transition-transform shrink-0" />
                      </summary>
                      <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{item.respuesta}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}

          <footer className="text-center pb-4">
            <p className="text-sm text-neutral-500">
              ¿No encontraste lo que buscabas?{' '}
              {soporte ? (
                <>
                  Escribe a{' '}
                  <a href={`mailto:${soporte}`} className="font-semibold text-neutral-900 underline underline-offset-4">
                    {soporte}
                  </a>
                  .
                </>
              ) : (
                'Consulta al administrador de la plataforma.'
              )}
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
