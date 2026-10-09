import { createAdminClient } from '@/lib/supabase/admin';
import type { EventoAuditoria, UsuarioLogistica } from '@/lib/reporteLogistica';

/** Acciones de la auditoría que alimentan la reportería de Logística (R17). */
export const ACCIONES_REPORTE = ['calendarizacion', 'recalendarizacion', 'cancelacion_transito'] as const;

/** PostgREST devuelve como máximo 1000 filas por petición. */
const TAMANO_PAGINA = 1000;

/**
 * Datos de la reportería de Logística. Los cálculos viven en
 * `lib/reporteLogistica` (puros y testeados); aquí solo se leen los datos.
 */
export class ReporteService {
  /**
   * Eventos de calendarización, reprogramación y cancelación en tránsito de
   * solicitudes. Se leen todos (no solo los del período) porque el tiempo de
   * respuesta usa la PRIMERA calendarización de cada solicitud.
   */
  static async getEventosLogistica(): Promise<EventoAuditoria[]> {
    const admin = createAdminClient();
    const eventos: EventoAuditoria[] = [];
    try {
      for (let desde = 0; ; desde += TAMANO_PAGINA) {
        const { data, error } = await admin
          .from('auditoria')
          .select('entidad_id, usuario_id, accion, created_at')
          .eq('entidad', 'solicitud')
          .in('accion', [...ACCIONES_REPORTE])
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(desde, desde + TAMANO_PAGINA - 1);
        if (error) {
          console.error('Error al leer la auditoría para la reportería:', error);
          return eventos;
        }
        const pagina = (data ?? []) as EventoAuditoria[];
        eventos.push(...pagina);
        if (pagina.length < TAMANO_PAGINA) return eventos;
      }
    } catch (err) {
      console.error('Error en getEventosLogistica:', err);
      return eventos;
    }
  }

  /** Usuarios activos de Logística (aparecen en el reporte aunque no tengan actividad). */
  static async getUsuariosLogistica(): Promise<UsuarioLogistica[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id, nombre, apellido')
        .eq('rol', 'logistica')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error || !data) return [];
      return (data as Array<{ id: string; nombre: string; apellido: string }>).map((u) => ({
        id: u.id,
        nombre: `${u.nombre} ${u.apellido}`.trim(),
      }));
    } catch (err) {
      console.error('Error en getUsuariosLogistica:', err);
      return [];
    }
  }
}
