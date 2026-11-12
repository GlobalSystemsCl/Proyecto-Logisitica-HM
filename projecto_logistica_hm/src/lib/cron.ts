/**
 * Autorización de las rutas de cron (R9). Vercel Cron envía
 * `Authorization: Bearer <CRON_SECRET>`. Sin secreto configurado (o con uno
 * muy corto) la ruta queda cerrada.
 */
export function autorizadoCron(cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || secreto.length < 16) return false;
  return cabecera === `Bearer ${secreto}`;
}
