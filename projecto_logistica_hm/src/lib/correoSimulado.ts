/**
 * Modo de correo simulado (prueba de estrés, 2026-11-17).
 *
 * Con `CORREO_SIMULADO=1` la app no llama a Brevo: `EmailService.enviarCorreo`
 * devuelve un fallo con `ERROR_CORREO_SIMULADO` antes de cualquier `fetch`.
 * Se devuelve como fallo (y no como éxito) para que el registro quede en
 * `correo_envio` como `fallido`: el tope diario solo cuenta los `enviado`, y
 * esa tabla es compartida con producción.
 *
 * Solo se activa en el deploy de preview de la rama `stress-test`; producción
 * no tiene la variable.
 */

export const ERROR_CORREO_SIMULADO = 'CORREO_SIMULADO: envío bloqueado por la prueba de carga.';

const VALORES_ACTIVOS = new Set(['1', 'true', 'si', 'sí', 'on']);

/**
 * Rama del deploy de la prueba de carga. Vercel define `VERCEL_GIT_COMMIT_REF`
 * en cada deploy: así el bloqueo rige desde el primer build de la rama, aunque
 * todavía no tenga sus variables de entorno.
 */
export const RAMA_PRUEBA_CARGA = 'stress-test';

/** `true` si el entorno pide no enviar correos reales. */
export function correoSimulado(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_GIT_COMMIT_REF?.trim() === RAMA_PRUEBA_CARGA) return true;
  const valor = env.CORREO_SIMULADO?.trim().toLowerCase();
  return valor ? VALORES_ACTIVOS.has(valor) : false;
}
