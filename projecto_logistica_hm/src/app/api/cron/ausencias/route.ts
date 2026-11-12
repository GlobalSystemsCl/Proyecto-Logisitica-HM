import { AusenciaService } from '@/services/ausencia.service';
import { hoyChile } from '@/lib/ausencias';
import { autorizadoCron } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/**
 * R9: cron diario de Vercel (`vercel.json`). Inicia las ausencias de
 * Logística que llegan a su fecha y termina las vencidas. Vercel envía
 * `Authorization: Bearer <CRON_SECRET>`; sin esa variable la ruta no responde.
 */
export async function GET(request: Request) {
  if (!autorizadoCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const resultado = await AusenciaService.procesarPendientes(hoyChile(), null);
  if (resultado.errores.length > 0) console.error('[cron ausencias]', resultado.errores);
  return Response.json(resultado);
}
