'use server';
import { ROLES_GESTION_VEHICULOS } from '@/lib/vehiculo';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { VehiculoService } from '@/services/vehiculo.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { accionCambioVehiculo, diferenciasVehiculo, resumenVehiculo } from '@/lib/auditoriaVehiculo';
import { randomUUID } from 'crypto';
import { CreateVehiculoInput, UpdateVehiculoInput } from '@/types/vehiculo.types';
import { revalidatePath } from 'next/cache';
import { OrganizacionService } from '@/services/organizacion.service';
import { validarMarcaNueva, type MarcaCatalogo } from '@/lib/marcasVehiculo';
import { SucursalesService } from '@/services/sucursales.service';
import { enLotes } from '@/lib/paginacion';
import { MAX_CAMBIO_UBICACION, type VehiculoUbicacion } from '@/lib/ubicacionMasiva';
import {
  analizarPlantillaUbicacion,
  MAX_FILAS_PLANTILLA_UBICACION,
  resumenCargaUbicaciones,
  type ErrorFilaUbicacion,
  type FilaPlantillaUbicacion,
} from '@/lib/plantillaUbicacion';
import {
  confirmacionReversionValida,
  motivoNoRevertible,
  TEXTO_CONFIRMAR_REVERSION,
  textoResultadoReversion,
} from '@/lib/reversionImportacion';

async function verifyVehiculoPermission() {
  const profile = await requireProfile();
  // QA #15: el jefe de local solo consulta el inventario.
  requireRole(profile, [...ROLES_GESTION_VEHICULOS], 'Solo Logística y el administrador gestionan vehículos.');
  return profile;
}

/**
 * R2: registra en la auditoría un cambio del inventario con su autor. Es
 * best-effort como el resto de la auditoría: un fallo no revierte la operación.
 */
async function auditarVehiculo(
  usuarioId: string,
  entidadId: string,
  accion: string,
  anterior: unknown,
  nuevo: unknown
): Promise<void> {
  await SolicitudesService.registrarAuditoria(usuarioId, 'vehiculo', entidadId, accion, anterior, nuevo);
}

export async function createVehiculoAction(data: CreateVehiculoInput) {
  try {
    const profile = await verifyVehiculoPermission();

    if (!data.chasis?.trim() || !data.marca?.trim() || !data.modelo?.trim()) {
      return {
        success: false,
        error: 'El chasis, la marca y el modelo son obligatorios.',
      };
    }

    const result = await VehiculoService.createVehiculo(data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    if (result.vehiculo?.id) {
      await auditarVehiculo(profile.id, result.vehiculo.id, 'creacion', null, resumenVehiculo(result.vehiculo));
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: `Vehículo ${result.vehiculo?.marca} ${result.vehiculo?.modelo} registrado exitosamente.`,
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

export async function updateVehiculoAction(id: string, data: UpdateVehiculoInput) {
  try {
    const profile = await verifyVehiculoPermission();

    const anterior = await VehiculoService.getVehiculoById(id);
    const result = await VehiculoService.updateVehiculo(id, data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const cambios = diferenciasVehiculo(anterior, result.vehiculo);
    if (cambios) {
      await auditarVehiculo(profile.id, id, accionCambioVehiculo(cambios), cambios.anterior, cambios.nuevo);
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo actualizado exitosamente.',
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/**
 * Fase G: cambio de ubicación masivo. Registra la auditoría de cada vehículo
 * movido (`cambio_ubicacion`, con la ubicación anterior y la nueva).
 */
export async function cambiarUbicacionMasivaAction(ids: string[], sucursalId: number) {
  try {
    const profile = await verifyVehiculoPermission();
    const result = await VehiculoService.cambiarUbicacionMasiva(ids, sucursalId);
    if (!result.success) return result;

    await auditarCambiosUbicacion(profile.id, result.movidos, sucursalId);

    if (result.movidos.length > 0) revalidatePath('/admin/vehiculos');
    return result;
  } catch (err: unknown) {
    return { success: false, movidos: [], omitidos: [], error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Auditoría `cambio_ubicacion` de cada vehículo movido, con la ubicación anterior y la nueva. */
async function auditarCambiosUbicacion(usuarioId: string, movidos: VehiculoUbicacion[], sucursalId: number) {
  if (movidos.length === 0) return;
  await SolicitudesService.registrarAuditoriaMasiva(
    movidos.map((v) => ({
      usuarioId,
      entidad: 'vehiculo',
      entidadId: v.id,
      accion: 'cambio_ubicacion',
      anterior: { ubicacion: v.ubicacion },
      nuevo: { ubicacion: sucursalId },
    }))
  );
}

export interface ResultadoCargaUbicaciones {
  success: boolean;
  movidos: number;
  sinUbicacion: number;
  /** Filas que no se actualizaron, con el motivo (VIN no válido, sucursal desconocida, reservado...). */
  errores: ErrorFilaUbicacion[];
  mensaje?: string;
  error?: string;
}

/**
 * Cambio de ubicación masivo con la plantilla Excel (2026-11-23): recibe las
 * filas VIN + Ubicación y mueve solo esos vehículos, con las mismas reglas que
 * "Asignar ubicación" (no mueve reservados, entregados ni en traslado).
 */
export async function cambiarUbicacionPorPlantillaAction(filas: FilaPlantillaUbicacion[]): Promise<ResultadoCargaUbicaciones> {
  const vacio = { movidos: 0, sinUbicacion: 0, errores: [] as ErrorFilaUbicacion[] };
  try {
    const profile = await verifyVehiculoPermission();
    if (!Array.isArray(filas) || filas.length === 0) return { success: false, ...vacio, error: 'El archivo no tiene vehículos.' };
    if (filas.length > MAX_FILAS_PLANTILLA_UBICACION) {
      return { success: false, ...vacio, error: `El máximo es ${MAX_FILAS_PLANTILLA_UBICACION} filas por archivo.` };
    }
    const limpias: FilaPlantillaUbicacion[] = filas.map((f) => ({
      fila: Number(f?.fila) || 0,
      vin: String(f?.vin ?? '').trim().toUpperCase(),
      ubicacion: String(f?.ubicacion ?? '').trim(),
    }));

    const sucursales = await SucursalesService.getSucursales({ incluirInactivas: true });
    const analisis = analizarPlantillaUbicacion(limpias, sucursales);
    const errores = [...analisis.errores];
    const filaDeVin = new Map(limpias.map((f) => [f.vin, f.fila]));

    const { ids, error } = await VehiculoService.idsPorChasis(analisis.grupos.flatMap((g) => g.vins));
    if (error) return { success: false, ...vacio, error };

    let movidos = 0;
    for (const grupo of analisis.grupos) {
      const idsGrupo: string[] = [];
      for (const vin of grupo.vins) {
        const id = ids.get(vin);
        if (id) idsGrupo.push(id);
        else errores.push({ fila: filaDeVin.get(vin) ?? 0, vin, motivo: 'El VIN no está en el inventario.' });
      }
      for (const lote of enLotes(idsGrupo, MAX_CAMBIO_UBICACION)) {
        const r = await VehiculoService.cambiarUbicacionMasiva(lote, grupo.sucursalId);
        if (!r.success) {
          const vinDeId = new Map([...ids].map(([vin, id]) => [id, vin]));
          for (const id of lote) {
            const vin = vinDeId.get(id) ?? '';
            errores.push({ fila: filaDeVin.get(vin) ?? 0, vin, motivo: r.error ?? 'No se pudo actualizar.' });
          }
          continue;
        }
        await auditarCambiosUbicacion(profile.id, r.movidos, grupo.sucursalId);
        movidos += r.movidos.length;
        for (const o of r.omitidos) errores.push({ fila: filaDeVin.get(o.chasis) ?? 0, vin: o.chasis, motivo: o.motivo });
      }
    }

    if (movidos > 0) {
      revalidatePath('/admin/vehiculos');
      revalidatePath('/logistica/slots');
      revalidatePath('/dashboard');
    }
    errores.sort((a, b) => a.fila - b.fila);
    return {
      success: true,
      movidos,
      sinUbicacion: analisis.sinUbicacion,
      errores,
      mensaje: resumenCargaUbicaciones({ movidos, noActualizados: errores.length, sinUbicacion: analisis.sinUbicacion }),
    };
  } catch (err: unknown) {
    return { success: false, ...vacio, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function deleteVehiculoAction(id: string) {
  try {
    const profile = await verifyVehiculoPermission();

    if (profile.rol !== 'administrador') {
      return {
        success: false,
        error: 'Solo los administradores pueden eliminar vehículos.',
      };
    }

    const anterior = await VehiculoService.getVehiculoById(id);
    const result = await VehiculoService.deleteVehiculo(id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await auditarVehiculo(profile.id, id, 'eliminacion', resumenVehiculo(anterior), null);

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo eliminado exitosamente.',
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

export interface ImportVehiculosData {
  csv: string;
  anioPorDefecto?: number;
  /** Nombre del archivo subido (se muestra al revertir). */
  archivo?: string;
}

export async function importVehiculosAction(data: ImportVehiculosData) {
  try {
    const profile = await verifyVehiculoPermission();

    if (!data.csv?.trim()) {
      return { success: false, error: 'Debes pegar o subir el contenido CSV del stock.' };
    }

    const result = await VehiculoService.importVehiculosCSV(data.csv, {
      anioPorDefecto: data.anioPorDefecto,
      usuarioId: profile.id,
      archivo: data.archivo ?? null,
    });

    if (!result.success && !result.importados) {
      return { success: false, error: result.error || result.mensaje || 'Error al importar.' };
    }

    // Un registro por importación (no uno por vehículo, para no saturar la auditoría).
    await auditarVehiculo(profile.id, result.importacionId ?? randomUUID(), 'importacion', null, {
      archivo: data.archivo ?? null,
      total: result.total ?? 0,
      importados: result.importados ?? 0,
      duplicados: result.duplicados ?? 0,
      errores: result.errores ?? 0,
    });

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      importacionId: result.importacionId,
      mensaje: result.mensaje,
      total: result.total,
      importados: result.importados,
      duplicados: result.duplicados,
      errores: result.errores,
      marcasProcesadas: result.marcasProcesadas,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/** Rutas que cambian al agregar o quitar vehículos del inventario (slots incluidos). */
const RUTAS_INVENTARIO = ['/admin/vehiculos', '/admin/sucursales', '/logistica/slots', '/dashboard'];

/** Últimas importaciones de stock, para el modal "Revertir importación". */
/**
 * Crea una marca del catálogo desde el alta de vehículos (2026-11-23): quien
 * registra vehículos (Logística y administrador) puede agregar la marca que
 * falta sin ir a "Marcas".
 */
export async function crearMarcaVehiculoAction(
  input: MarcaCatalogo
): Promise<{ success: boolean; marca?: MarcaCatalogo; error?: string }> {
  try {
    await verifyVehiculoPermission();
    const marca = { codigo: (input?.codigo ?? '').trim().toUpperCase(), nombre: (input?.nombre ?? '').trim().toUpperCase() };
    const error = validarMarcaNueva(marca);
    if (error) return { success: false, error };
    const res = await OrganizacionService.createMarca(marca);
    if (!res.success || !res.marca) return { success: false, error: res.error || 'No se pudo crear la marca.' };
    revalidatePath('/admin/marcas');
    return { success: true, marca: { id: res.marca.id, codigo: res.marca.codigo, nombre: res.marca.nombre } };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function getImportacionesStockAction() {
  try {
    await verifyVehiculoPermission();
    return { success: true as const, importaciones: await VehiculoService.listarImportaciones() };
  } catch (err: unknown) {
    return { success: false as const, error: mensajeErrorUsuario(err, 'No se pudieron cargar las importaciones.') };
  }
}

/**
 * Revierte una importación subida por error: borra los vehículos que creó y
 * que no se usan en solicitudes ni traslados. Exige escribir CONFIRMAR. El
 * administrador revierte cualquiera; Logística, solo las suyas.
 */
export async function revertirImportacionStockAction(importacionId: string, confirmacion: string) {
  try {
    const profile = await verifyVehiculoPermission();
    if (!confirmacionReversionValida(confirmacion)) {
      return { success: false as const, error: `Escribe ${TEXTO_CONFIRMAR_REVERSION} para confirmar.` };
    }
    if (!/^[0-9a-f-]{36}$/i.test(importacionId ?? '')) {
      return { success: false as const, error: 'Importación no válida.' };
    }

    const importacion = await VehiculoService.getImportacion(importacionId);
    if (!importacion) return { success: false as const, error: 'La importación no existe.' };
    const motivo = motivoNoRevertible(importacion, profile);
    if (motivo) return { success: false as const, error: motivo };

    const res = await VehiculoService.revertirImportacion(importacionId, profile.id);
    if (!res.success) return { success: false as const, error: res.error };

    await auditarVehiculo(
      profile.id,
      importacionId,
      'reversion_importacion',
      { archivo: importacion.archivo, importados: importacion.importados, fecha: importacion.created_at },
      { eliminados: res.eliminados, conservados: res.conservados }
    );

    for (const ruta of RUTAS_INVENTARIO) revalidatePath(ruta);
    return {
      success: true as const,
      eliminados: res.eliminados,
      conservados: res.conservados,
      mensaje: textoResultadoReversion(res.eliminados, res.conservados),
    };
  } catch (err: unknown) {
    return { success: false as const, error: mensajeErrorUsuario(err, 'Error inesperado al revertir la importación.') };
  }
}
