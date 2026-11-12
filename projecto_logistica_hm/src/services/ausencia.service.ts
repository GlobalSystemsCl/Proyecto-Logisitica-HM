import { createAdminClient } from '@/lib/supabase/admin';
import { mensajeErrorUsuario } from '@/lib/errores';
import {
  ESTADOS_SOLICITUD_TRASPASABLES,
  ESTADOS_TRASLADO_TRASPASABLES,
  accionPendiente,
  rangosSeCruzan,
  validarAusencia,
  zonasTemporales,
  type DatosAusencia,
  type EstadoAusencia,
} from '@/lib/ausencias';
import { UsersService } from '@/services/users.service';
import { SolicitudesService } from '@/services/solicitudes.service';

export interface Ausencia {
  id: string;
  titular_id: string;
  sustituto_id: string;
  titular_nombre: string;
  sustituto_nombre: string;
  desde: string;
  hasta: string;
  estado: EstadoAusencia;
  motivo: string | null;
  iniciada_at: string | null;
  finalizada_at: string | null;
}

type Resultado = { success: boolean; error?: string };

type FilaAusencia = Omit<Ausencia, 'titular_nombre' | 'sustituto_nombre'> & {
  titular?: { nombre: string; apellido: string } | null;
  sustituto?: { nombre: string; apellido: string } | null;
  creada_por?: string | null;
};

const SELECT_AUSENCIA = `id, titular_id, sustituto_id, desde, hasta, estado, motivo, iniciada_at, finalizada_at, creada_por,
  titular:usuario!ausencia_usuario_titular_id_fkey(nombre, apellido),
  sustituto:usuario!ausencia_usuario_sustituto_id_fkey(nombre, apellido)`;

function nombre(p: { nombre: string; apellido: string } | null | undefined): string {
  return p ? `${p.nombre} ${p.apellido}`.trim() : 'Usuario';
}

function mapAusencia(f: FilaAusencia): Ausencia {
  return {
    id: f.id,
    titular_id: f.titular_id,
    sustituto_id: f.sustituto_id,
    titular_nombre: nombre(f.titular),
    sustituto_nombre: nombre(f.sustituto),
    desde: f.desde,
    hasta: f.hasta,
    estado: f.estado,
    motivo: f.motivo ?? null,
    iniciada_at: f.iniciada_at ?? null,
    finalizada_at: f.finalizada_at ?? null,
  };
}

/**
 * R9 (2026-11-12): ausencias de Logística con sustituto. Ver `lib/ausencias.ts`
 * para las reglas. Inicio: congela al titular, traspasa sus solicitudes y
 * traslados en curso al sustituto y le suma sus zonas. Fin: devuelve lo
 * traspasado que siga abierto, quita las zonas temporales y reactiva al titular.
 */
export class AusenciaService {
  static async listar(): Promise<Ausencia[]> {
    try {
      const { data, error } = await createAdminClient()
        .from('ausencia_usuario')
        .select(SELECT_AUSENCIA)
        .order('desde', { ascending: false });
      if (error) {
        console.error('Error al listar ausencias:', error);
        return [];
      }
      return ((data ?? []) as unknown as FilaAusencia[]).map(mapAusencia);
    } catch (err) {
      console.error('Error en listar ausencias:', err);
      return [];
    }
  }

  /** Usuarios de Logística (activos o no) para elegir titular y sustituto. */
  static async usuariosLogistica(): Promise<Array<{ id: string; nombre: string; activo: boolean }>> {
    const { data } = await createAdminClient()
      .from('usuario')
      .select('id, nombre, apellido, activo')
      .eq('rol', 'logistica')
      .order('nombre', { ascending: true });
    return ((data ?? []) as Array<{ id: string; nombre: string; apellido: string; activo: boolean }>).map((u) => ({
      id: u.id,
      nombre: nombre(u),
      activo: u.activo,
    }));
  }

  static async crear(datos: DatosAusencia & { motivo?: string | null }, actorId: string, hoy: string): Promise<Resultado> {
    const error = validarAusencia(datos, hoy);
    if (error) return { success: false, error };
    try {
      const admin = createAdminClient();
      const { data: usuarios } = await admin
        .from('usuario')
        .select('id, rol, activo')
        .in('id', [datos.titularId, datos.sustitutoId]);
      const porId = new Map(((usuarios ?? []) as Array<{ id: string; rol: string; activo: boolean }>).map((u) => [u.id, u]));
      const titular = porId.get(datos.titularId);
      const sustituto = porId.get(datos.sustitutoId);
      if (!titular || titular.rol !== 'logistica' || !sustituto || sustituto.rol !== 'logistica') {
        return { success: false, error: 'El titular y el sustituto deben ser usuarios de Logística.' };
      }
      if (!sustituto.activo) return { success: false, error: 'El sustituto debe tener la cuenta activa.' };

      // El sustituto no puede estar ausente en esos mismos días.
      const { data: delSustituto } = await admin
        .from('ausencia_usuario')
        .select('desde, hasta')
        .eq('titular_id', datos.sustitutoId)
        .in('estado', ['programada', 'activa']);
      if (((delSustituto ?? []) as Array<{ desde: string; hasta: string }>).some((a) => rangosSeCruzan(a, datos))) {
        return { success: false, error: 'El sustituto tiene una ausencia en esos mismos días.' };
      }

      const { data: creada, error: insertError } = await admin
        .from('ausencia_usuario')
        .insert({
          titular_id: datos.titularId,
          sustituto_id: datos.sustitutoId,
          desde: datos.desde,
          hasta: datos.hasta,
          motivo: datos.motivo?.trim() || null,
          creada_por: actorId,
        })
        .select('id')
        .single();
      if (insertError || !creada) {
        if (insertError?.code === '23505') return { success: false, error: 'Ese usuario ya tiene una ausencia programada o en curso.' };
        return { success: false, error: mensajeErrorUsuario(insertError, 'No se pudo registrar la ausencia.') };
      }
      const id = (creada as { id: string }).id;
      await SolicitudesService.registrarAuditoria(actorId, 'ausencia', id, 'creacion_ausencia', null, datos);
      if (datos.desde <= hoy) return AusenciaService.iniciar(id, actorId);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al registrar la ausencia.') };
    }
  }

  private static async obtener(id: string): Promise<FilaAusencia | null> {
    const { data } = await createAdminClient().from('ausencia_usuario').select(SELECT_AUSENCIA).eq('id', id).maybeSingle();
    return (data as unknown as FilaAusencia | null) ?? null;
  }

  /** Inicia la ausencia: traspasos, zonas temporales y cuenta congelada. */
  static async iniciar(id: string, actorId: string): Promise<Resultado> {
    try {
      const admin = createAdminClient();
      const a = await AusenciaService.obtener(id);
      if (!a) return { success: false, error: 'Ausencia no encontrada.' };
      if (a.estado !== 'programada') return { success: false, error: 'Solo se puede iniciar una ausencia programada.' };

      const [solicitudes, traslados] = await Promise.all([
        admin
          .from('solicitud')
          .select('id')
          .eq('logistica_id', a.titular_id)
          .in('estado', [...ESTADOS_SOLICITUD_TRASPASABLES]),
        admin
          .from('traslado_interno')
          .select('id')
          .eq('logistica_id', a.titular_id)
          .in('estado', [...ESTADOS_TRASLADO_TRASPASABLES]),
      ]);
      const idsSolicitud = ((solicitudes.data ?? []) as Array<{ id: string }>).map((s) => s.id);
      const idsTraslado = ((traslados.data ?? []) as Array<{ id: string }>).map((t) => t.id);

      if (idsSolicitud.length > 0) {
        const { error } = await admin.from('solicitud').update({ logistica_id: a.sustituto_id }).in('id', idsSolicitud);
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudieron traspasar las solicitudes.') };
      }
      if (idsTraslado.length > 0) {
        const { error } = await admin.from('traslado_interno').update({ logistica_id: a.sustituto_id }).in('id', idsTraslado);
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudieron traspasar los traslados.') };
      }
      const traspasos = [
        ...idsSolicitud.map((entidad_id) => ({ ausencia_id: id, entidad: 'solicitud', entidad_id })),
        ...idsTraslado.map((entidad_id) => ({ ausencia_id: id, entidad: 'traslado_interno', entidad_id })),
      ];
      if (traspasos.length > 0) {
        const { error } = await admin.from('ausencia_traspaso').insert(traspasos);
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo registrar el traspaso.') };
      }

      // Zonas del titular que el sustituto no tiene: temporales (se quitan al terminar).
      const [zonasTitular, zonasSustituto] = await Promise.all([
        admin.from('usuario_zona').select('zona_id').eq('usuario_id', a.titular_id).is('ausencia_id', null),
        admin.from('usuario_zona').select('zona_id').eq('usuario_id', a.sustituto_id),
      ]);
      const nuevas = zonasTemporales(
        ((zonasTitular.data ?? []) as Array<{ zona_id: number }>).map((z) => z.zona_id),
        ((zonasSustituto.data ?? []) as Array<{ zona_id: number }>).map((z) => z.zona_id)
      );
      if (nuevas.length > 0) {
        const { error } = await admin
          .from('usuario_zona')
          .insert(nuevas.map((zona_id) => ({ usuario_id: a.sustituto_id, zona_id, ausencia_id: id })));
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudieron asignar las zonas al sustituto.') };
      }

      const congelar = await UsersService.toggleUserStatus(a.titular_id, false, actorId);
      if (!congelar.success) return { success: false, error: congelar.error };

      const { error } = await admin
        .from('ausencia_usuario')
        .update({ estado: 'activa', iniciada_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo iniciar la ausencia.') };

      await SolicitudesService.registrarAuditoria(actorId, 'ausencia', id, 'inicio_ausencia', null, {
        solicitudes: idsSolicitud.length,
        traslados: idsTraslado.length,
        zonas: nuevas,
      });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al iniciar la ausencia.') };
    }
  }

  /** Termina la ausencia: devuelve lo traspasado que siga abierto, quita las zonas temporales y reactiva al titular. */
  static async finalizar(id: string, actorId: string): Promise<Resultado> {
    try {
      const admin = createAdminClient();
      const a = await AusenciaService.obtener(id);
      if (!a) return { success: false, error: 'Ausencia no encontrada.' };
      if (a.estado !== 'activa') return { success: false, error: 'Solo se puede terminar una ausencia en curso.' };

      const { data: traspasos } = await admin.from('ausencia_traspaso').select('entidad, entidad_id').eq('ausencia_id', id);
      const filas = (traspasos ?? []) as Array<{ entidad: string; entidad_id: string }>;
      const idsSolicitud = filas.filter((t) => t.entidad === 'solicitud').map((t) => t.entidad_id);
      const idsTraslado = filas.filter((t) => t.entidad === 'traslado_interno').map((t) => t.entidad_id);

      // Solo vuelve lo que sigue abierto y a cargo del sustituto (lo cerrado queda a su nombre).
      if (idsSolicitud.length > 0) {
        const { error } = await admin
          .from('solicitud')
          .update({ logistica_id: a.titular_id })
          .in('id', idsSolicitud)
          .eq('logistica_id', a.sustituto_id)
          .in('estado', [...ESTADOS_SOLICITUD_TRASPASABLES]);
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudieron devolver las solicitudes.') };
      }
      if (idsTraslado.length > 0) {
        const { error } = await admin
          .from('traslado_interno')
          .update({ logistica_id: a.titular_id })
          .in('id', idsTraslado)
          .eq('logistica_id', a.sustituto_id)
          .in('estado', [...ESTADOS_TRASLADO_TRASPASABLES]);
        if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudieron devolver los traslados.') };
      }

      const { error: zonasError } = await admin.from('usuario_zona').delete().eq('ausencia_id', id);
      if (zonasError) return { success: false, error: mensajeErrorUsuario(zonasError, 'No se pudieron quitar las zonas temporales.') };

      const reactivar = await UsersService.toggleUserStatus(a.titular_id, true, actorId);
      if (!reactivar.success) return { success: false, error: reactivar.error };

      const { error } = await admin
        .from('ausencia_usuario')
        .update({ estado: 'finalizada', finalizada_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo terminar la ausencia.') };

      await SolicitudesService.registrarAuditoria(actorId, 'ausencia', id, 'fin_ausencia', null, {
        solicitudes: idsSolicitud.length,
        traslados: idsTraslado.length,
      });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al terminar la ausencia.') };
    }
  }

  /** Cancela una programada o termina ahora una en curso. */
  static async cancelar(id: string, actorId: string): Promise<Resultado> {
    const a = await AusenciaService.obtener(id);
    if (!a) return { success: false, error: 'Ausencia no encontrada.' };
    if (a.estado === 'activa') return AusenciaService.finalizar(id, actorId);
    if (a.estado !== 'programada') return { success: false, error: 'La ausencia ya está cerrada.' };
    const { error } = await createAdminClient().from('ausencia_usuario').update({ estado: 'cancelada' }).eq('id', id);
    if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo cancelar la ausencia.') };
    await SolicitudesService.registrarAuditoria(actorId, 'ausencia', id, 'cancelacion_ausencia', null, null);
    return { success: true };
  }

  /**
   * Inicia las que llegaron a su fecha y termina las vencidas. Lo llaman el
   * cron diario y la pantalla de ausencias. `actorId` null = proceso
   * automático: la auditoría queda a nombre de quien creó la ausencia.
   */
  static async procesarPendientes(
    hoy: string,
    actorId: string | null
  ): Promise<{ iniciadas: number; finalizadas: number; errores: string[] }> {
    const resultado = { iniciadas: 0, finalizadas: 0, errores: [] as string[] };
    const { data, error } = await createAdminClient()
      .from('ausencia_usuario')
      .select('id, estado, desde, hasta, creada_por')
      .in('estado', ['programada', 'activa']);
    if (error) {
      resultado.errores.push(mensajeErrorUsuario(error, 'No se pudieron leer las ausencias.'));
      return resultado;
    }
    const filas = (data ?? []) as Array<{ id: string; estado: EstadoAusencia; desde: string; hasta: string; creada_por: string | null }>;
    for (const a of filas) {
      const accion = accionPendiente(a, hoy);
      if (!accion) continue;
      // Sin actor (cron): quien creó la ausencia; nunca el titular, que no puede congelarse a sí mismo.
      const actor = actorId ?? a.creada_por ?? 'sistema';
      if (accion === 'vencida') {
        await createAdminClient().from('ausencia_usuario').update({ estado: 'finalizada', finalizada_at: new Date().toISOString() }).eq('id', a.id);
        resultado.finalizadas += 1;
        continue;
      }
      const res = accion === 'iniciar' ? await AusenciaService.iniciar(a.id, actor) : await AusenciaService.finalizar(a.id, actor);
      if (!res.success) {
        resultado.errores.push(res.error ?? 'Error al procesar la ausencia.');
        continue;
      }
      if (accion === 'iniciar') resultado.iniciadas += 1;
      else resultado.finalizadas += 1;
    }
    return resultado;
  }
}
