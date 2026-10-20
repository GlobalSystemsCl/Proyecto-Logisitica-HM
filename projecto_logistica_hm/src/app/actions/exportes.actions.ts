'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import {
  ESTADOS_CALENDARIZACION_EXPORTE,
  filasExcelCalendarizacion,
  validarRangoExporte,
} from '@/lib/reporteTraslados';
import { SolicitudesService } from '@/services/solicitudes.service';

/**
 * Filas del Excel de la calendarización: solicitudes programadas o en
 * tránsito con fecha de despacho programada dentro del rango, con el mismo
 * alcance que el calendario (Logística: sus zonas; jefe de local: sus
 * sucursales; administrador: todas).
 */
export async function exportarCalendarizacionAction(desde: string, hasta: string) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador', 'jefe_local'], 'No tienes acceso al calendario de traslados.');

    const errorRango = validarRangoExporte(desde, hasta);
    if (errorRango) return { success: false as const, error: errorRango };

    const solicitudes = await SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol, {
      estados: ESTADOS_CALENDARIZACION_EXPORTE,
      programadasDesde: desde,
      programadasHasta: hasta,
    });

    return { success: true as const, filas: filasExcelCalendarizacion(solicitudes) };
  } catch (err: unknown) {
    return { success: false as const, error: mensajeErrorUsuario(err, 'No se pudo generar el Excel.') };
  }
}
