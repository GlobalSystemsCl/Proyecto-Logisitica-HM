import { after } from 'next/server';

/**
 * Ejecuta una tarea después de responder al usuario (`after` de Next.js), por
 * ejemplo el envío de correos (R7): la operación no espera a Brevo y un fallo
 * del correo no la afecta.
 *
 * Fuera de una petición de Next (scripts o tests), `after` lanza; en ese caso
 * la tarea se ejecuta de inmediato sin esperar su resultado.
 */
export function enSegundoPlano(tarea: () => Promise<unknown>): void {
  const ejecutar = async () => {
    try {
      await tarea();
    } catch (err) {
      console.error('Error en tarea en segundo plano:', err);
    }
  };
  try {
    after(ejecutar);
  } catch {
    void ejecutar();
  }
}
