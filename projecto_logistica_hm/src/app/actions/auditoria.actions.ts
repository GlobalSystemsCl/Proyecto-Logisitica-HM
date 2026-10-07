'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { AuditoriaService } from '@/services/auditoria.service';
import { AuditoriaFiltros } from '@/types/auditoria.types';

async function verifyAdminPermission() {
  const profile = await requireProfile();
  requireRole(profile, ['administrador'], 'Acceso no autorizado. Se requieren permisos de Administrador.');
  return profile;
}

export async function getAuditoriaAction(filtros?: AuditoriaFiltros) {
  try {
    await verifyAdminPermission();
    const data = await AuditoriaService.getAuditoria(filtros);
    return { success: true, data };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg, data: [] };
  }
}
