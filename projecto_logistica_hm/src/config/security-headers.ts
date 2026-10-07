/**
 * Cabeceras de seguridad HTTP para todas las rutas (brecha 019).
 *
 * La CSP se publica primero en modo Report-Only: no bloquea nada, solo
 * reporta en la consola del navegador lo que bloquearía. Cuando se confirme
 * que no hay violaciones en producción, cambiar la clave a
 * `Content-Security-Policy` (ver documentación de la brecha 019).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
];
