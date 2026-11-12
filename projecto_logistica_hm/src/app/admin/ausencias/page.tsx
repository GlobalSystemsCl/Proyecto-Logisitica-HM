import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { AusenciaService } from '@/services/ausencia.service';
import PageHeader from '@/components/PageHeader';
import AusenciasClient from './AusenciasClient';
import { hoyChile } from '@/lib/ausencias';

export const dynamic = 'force-dynamic';

/**
 * R9 (2026-11-12): ausencias de Logística con sustituto. Solo administrador.
 * Al abrir la pantalla se procesan las pendientes (respaldo del cron diario).
 */
export default async function AusenciasPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.rol !== 'administrador' || !profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const hoy = hoyChile();
  const procesadas = await AusenciaService.procesarPendientes(hoy, profile.id);
  const [ausencias, usuarios] = await Promise.all([AusenciaService.listar(), AusenciaService.usuariosLogistica()]);

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
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 pt-8 pb-24 sm:pb-8">
        <AusenciasClient ausencias={ausencias} usuarios={usuarios} hoy={hoy} erroresProceso={procesadas.errores} />
      </main>
    </div>
  );
}
