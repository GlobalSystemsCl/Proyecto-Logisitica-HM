import { createAdminClient } from '@/lib/supabase/admin';
import { Vehiculo, VehiculoConDisponibilidad, CreateVehiculoInput, UpdateVehiculoInput } from '@/types/vehiculo.types';

export class VehiculoService {
  /**
   * Obtiene la lista completa de vehículos con su estado de disponibilidad
   */
  static async getVehiculos(): Promise<VehiculoConDisponibilidad[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('vehiculo')
        .select(`
          *,
          solicitud_vehiculo!solicitud_vehiculo_vehiculo_fk (
            id,
            solicitud_id,
            disponibilidad
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al listar vehículos:', error);
        return [];
      }

      const vehiculos = (data || []).map((v: Record<string, unknown>) => {
        const sv = v.solicitud_vehiculo as Array<{ solicitud_id: string; disponibilidad: string }> | null;
        const reservaActiva = sv?.find((s) => s.disponibilidad === 'reservado');

        return {
          id: v.id as string,
          chasis: v.chasis as string,
          patente: v.patente as string,
          marca: v.marca as string,
          modelo: v.modelo as string,
          anio: v.anio as number,
          color: v.color as string | null,
          created_at: v.created_at as string,
          updated_at: v.updated_at as string,
          estado_disponibilidad: reservaActiva ? 'reservado' : 'liberado',
          solicitud_id: reservaActiva?.solicitud_id || null,
        } as VehiculoConDisponibilidad;
      });

      return vehiculos;
    } catch (err) {
      console.error('Error en getVehiculos:', err);
      return [];
    }
  }

  /**
   * Obtiene las marcas únicas registradas en la base de datos
   */
  static async getMarcas(): Promise<string[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('vehiculo')
        .select('marca')
        .order('marca');

      if (error) {
        console.error('Error al obtener marcas:', error);
        return [];
      }

      const marcasUnicas = [...new Set((data || []).map((v: { marca: string }) => v.marca))];
      return marcasUnicas;
    } catch (err) {
      console.error('Error en getMarcas:', err);
      return [];
    }
  }

  /**
   * Verifica la disponibilidad de un vehículo específico
   */
  static async verificarDisponibilidad(id: string): Promise<{ reservado: boolean; solicitud_id?: string }> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud_vehiculo')
        .select('solicitud_id, disponibilidad')
        .eq('vehiculo_id', id)
        .eq('disponibilidad', 'reservado')
        .maybeSingle();

      if (error) {
        console.error('Error al verificar disponibilidad:', error);
        return { reservado: false };
      }

      return {
        reservado: !!data,
        solicitud_id: data?.solicitud_id,
      };
    } catch (err) {
      console.error('Error en verificarDisponibilidad:', err);
      return { reservado: false };
    }
  }

  /**
   * Crea un nuevo vehículo
   */
  static async createVehiculo(input: CreateVehiculoInput): Promise<{
    success: boolean;
    vehiculo?: Vehiculo;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();
      const cleanChasis = input.chasis.trim().toUpperCase();
      const cleanPatente = input.patente.trim().toUpperCase();
      const cleanMarca = input.marca.trim();
      const cleanModelo = input.modelo.trim();

      // Validar chasis (17 caracteres alfanuméricos)
      if (!/^[A-Z0-9]{17}$/i.test(cleanChasis)) {
        return {
          success: false,
          error: 'El chasis debe tener exactamente 17 caracteres alfanuméricos.',
        };
      }

      // Validar patente (formato chileno: XXXX-XX o XXXX-XXXX)
      if (!/^[A-Z]{4}-[0-9]{2,4}$/i.test(cleanPatente)) {
        return {
          success: false,
          error: 'La patente debe tener el formato XXXX-XX o XXXX-XXXX (letras y guión).',
        };
      }

      // Verificar chasis duplicado
      const { data: existingChasis } = await admin
        .from('vehiculo')
        .select('id')
        .eq('chasis', cleanChasis)
        .maybeSingle();

      if (existingChasis) {
        return {
          success: false,
          error: `Ya existe un vehículo con el chasis ${cleanChasis}.`,
        };
      }

      // Verificar patente duplicada
      const { data: existingPatente } = await admin
        .from('vehiculo')
        .select('id')
        .eq('patente', cleanPatente)
        .maybeSingle();

      if (existingPatente) {
        return {
          success: false,
          error: `Ya existe un vehículo con la patente ${cleanPatente}.`,
        };
      }

      // Validar año
      const currentYear = new Date().getFullYear();
      if (input.anio < 1900 || input.anio > currentYear + 1) {
        return {
          success: false,
          error: `El año debe estar entre 1900 y ${currentYear + 1}.`,
        };
      }

      // Insertar vehículo
      const newVehiculo = {
        chasis: cleanChasis,
        patente: cleanPatente,
        marca: cleanMarca,
        modelo: cleanModelo,
        anio: input.anio,
        color: input.color?.trim() || null,
      };

      const { data, error } = await admin
        .from('vehiculo')
        .insert(newVehiculo)
        .select()
        .single();

      if (error) {
        console.error('Error al crear vehículo:', error);
        return {
          success: false,
          error: `Error al crear el vehículo: ${error.message}`,
        };
      }

      return {
        success: true,
        vehiculo: data as Vehiculo,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear vehículo';
      return { success: false, error: msg };
    }
  }

  /**
   * Actualiza un vehículo existente
   */
  static async updateVehiculo(id: string, input: UpdateVehiculoInput): Promise<{
    success: boolean;
    vehiculo?: Vehiculo;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      // Verificar disponibilidad
      const disponibilidad = await this.verificarDisponibilidad(id);
      if (disponibilidad.reservado) {
        return {
          success: false,
          error: 'No se puede modificar un vehículo que se encuentra reservado en una solicitud activa.',
        };
      }

      const updateData: UpdateVehiculoInput = {};

      if (input.chasis !== undefined) {
        const cleanChasis = input.chasis.trim().toUpperCase();
        if (!/^[A-Z0-9]{17}$/i.test(cleanChasis)) {
          return {
            success: false,
            error: 'El chasis debe tener exactamente 17 caracteres alfanuméricos.',
          };
        }
        // Verificar duplicado
        const { data: existing } = await admin
          .from('vehiculo')
          .select('id')
          .eq('chasis', cleanChasis)
          .neq('id', id)
          .maybeSingle();
        if (existing) {
          return { success: false, error: `Ya existe otro vehículo con el chasis ${cleanChasis}.` };
        }
        updateData.chasis = cleanChasis;
      }

      if (input.patente !== undefined) {
        const cleanPatente = input.patente.trim().toUpperCase();
        if (!/^[A-Z]{4}-[0-9]{2,4}$/i.test(cleanPatente)) {
          return {
            success: false,
            error: 'La patente debe tener el formato XXXX-XX o XXXX-XXXX.',
          };
        }
        // Verificar duplicado
        const { data: existing } = await admin
          .from('vehiculo')
          .select('id')
          .eq('patente', cleanPatente)
          .neq('id', id)
          .maybeSingle();
        if (existing) {
          return { success: false, error: `Ya existe otro vehículo con la patente ${cleanPatente}.` };
        }
        updateData.patente = cleanPatente;
      }

      if (input.marca !== undefined) updateData.marca = input.marca.trim();
      if (input.modelo !== undefined) updateData.modelo = input.modelo.trim();
      if (input.color !== undefined) updateData.color = input.color?.trim() || null;

      if (input.anio !== undefined) {
        const currentYear = new Date().getFullYear();
        if (input.anio < 1900 || input.anio > currentYear + 1) {
          return { success: false, error: `El año debe estar entre 1900 y ${currentYear + 1}.` };
        }
        updateData.anio = input.anio;
      }

      const { data, error } = await admin
        .from('vehiculo')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error al actualizar vehículo:', error);
        return { success: false, error: `Error al actualizar: ${error.message}` };
      }

      return { success: true, vehiculo: data as Vehiculo };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al actualizar vehículo';
      return { success: false, error: msg };
    }
  }

  /**
   * Elimina un vehículo
   */
  static async deleteVehiculo(id: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      // Verificar disponibilidad
      const disponibilidad = await this.verificarDisponibilidad(id);
      if (disponibilidad.reservado) {
        return {
          success: false,
          error: 'No se puede eliminar un vehículo que se encuentra reservado en una solicitud activa.',
        };
      }

      const { error } = await admin
        .from('vehiculo')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error al eliminar vehículo:', error);
        return { success: false, error: `Error al eliminar: ${error.message}` };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar vehículo';
      return { success: false, error: msg };
    }
  }
}
