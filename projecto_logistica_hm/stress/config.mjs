// Parámetros de la prueba de estrés de H.Motores (2026-11-17).
// Todo lo que se crea queda marcado y vive en rangos que no usan datos reales.

export const CONFIG = {
  /** Único proyecto permitido. Los scripts se detienen si `.env.local` apunta a otro. */
  proyectoSupabase: 'yaqbccvlenouqmtqrlrq',

  /** Marca visible en nombres, apellidos, modelos, etc. */
  marca: 'STRESS',

  /**
   * Dominio reservado (RFC 2606): un correo a `.invalid` no se entrega nunca.
   * Defensa adicional al bloqueo de Brevo. El login no valida dominios.
   */
  dominioCorreo: 'prueba-carga.invalid',

  /** Zona y sucursales ficticias: las reales van de 101 a 145. */
  zonaId: 9001,
  zonaNombre: 'STRESS - Prueba de carga',
  sucursalDesde: 9001,
  /** Una sucursal por jefe de local ficticio (cada sucursal tiene un solo jefe). */
  slotsPorSucursal: 600,

  /**
   * Objetivo 90 ejecutivos + 30 jefes + 2 administradores. Ya existen 5 ejecutivos,
   * 1 jefe y 3 administradores reales, así que faltan 85 y 29. Los administradores
   * reales no se pueden usar para generar carga (no tenemos ni debemos cambiar sus
   * credenciales): se crean 2 administradores ficticios solo para lecturas.
   */
  usuarios: { ejecutivo: 85, jefe_local: 29, administrador: 2, logistica: 4 },

  /** 900 solicitudes/mes durante 12 meses. */
  historia: { meses: 12, porMes: 900, fin: '2026-11-17T09:00:00-03:00', semilla: 20261117 },

  /** Vehículos libres por sucursal para crear solicitudes durante la carga. */
  stockLibrePorSucursal: 80,

  transportista: { nombre: 'STRESS Transportes de Prueba', rut: '99999990-1' },
  camiones: 10,
};

export const ROLES_SIM = ['ejecutivo', 'jefe_local', 'administrador', 'logistica'];

export function emailSim(rol, n) {
  const corto = { ejecutivo: 'ejec', jefe_local: 'jefe', administrador: 'admin', logistica: 'logi' }[rol];
  return `stress.${corto}.${String(n).padStart(3, '0')}@${CONFIG.dominioCorreo}`;
}

export function idsSucursalesSim() {
  return Array.from({ length: CONFIG.usuarios.jefe_local }, (_, i) => CONFIG.sucursalDesde + i);
}
