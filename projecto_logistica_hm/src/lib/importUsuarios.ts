import type { CreateUserInput, UserRole } from '@/types/auth.types';
import { normalizarAsignaciones } from '@/lib/asignaciones';
import { validarCampoTexto, validarEmailFormato } from '@/lib/validaciones';
import { validarDominioCorreo } from '@/lib/dominios';

/**
 * Carga masiva de usuarios desde Excel (fase F). El archivo se lee en el
 * navegador para la vista previa y el servidor vuelve a validar cada lote con
 * los datos actuales antes de crear las cuentas.
 */

export const COLUMNAS_PLANTILLA = ['Nombre', 'Apellido', 'Email', 'Rol', 'Sucursal', 'Zona'] as const;
export const MAX_FILAS_IMPORTACION = 200;
/** Filas por llamada al servidor: cada cuenta crea el usuario y envía un correo. */
export const TAMANO_LOTE_IMPORTACION = 20;

/** Roles que se pueden cargar. El administrador se crea de a uno. */
export const ROLES_IMPORTABLES: readonly UserRole[] = ['ejecutivo', 'jefe_local', 'logistica', 'operaciones'];

/** Fila tal como viene del Excel, con su número de fila (la 2 es la primera de datos). */
export interface FilaPlantilla {
  fila: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  sucursal: string;
  zona: string;
}

export interface FilaValidada {
  fila: number;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole | null;
  sucursal_id: number | null;
  zona_id: number | null;
  errores: string[];
}

export interface CatalogoImportacion {
  sucursales: Array<{ id: number; nombre: string | null }>;
  zonas: Array<{ id: number; nombre: string }>;
  /** Correos que ya tienen cuenta (en minúsculas). */
  emailsExistentes: Set<string>;
  /** Sucursales que ya tienen jefe de local (id → nombre del jefe). */
  sucursalesConJefe: Map<number, string>;
  /** Dominios permitidos, o `null` sin restricción. */
  dominios: string[] | null;
}

/** Minúsculas, sin tildes y con espacios simples, para comparar textos. */
export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

const ALIAS_COLUMNAS: Record<string, keyof Omit<FilaPlantilla, 'fila'>> = {
  nombre: 'nombre',
  nombres: 'nombre',
  apellido: 'apellido',
  apellidos: 'apellido',
  email: 'email',
  correo: 'email',
  'correo electronico': 'email',
  rol: 'rol',
  perfil: 'rol',
  sucursal: 'sucursal',
  zona: 'zona',
};

/**
 * Convierte las filas leídas del Excel (objetos por encabezado) a filas de la
 * plantilla. Acepta encabezados con o sin tildes y mayúsculas, y descarta las
 * filas completamente vacías.
 */
export function filasDesdeExcel(filas: Array<Record<string, unknown>>): FilaPlantilla[] {
  const resultado: FilaPlantilla[] = [];
  filas.forEach((original, i) => {
    const fila: FilaPlantilla = { fila: i + 2, nombre: '', apellido: '', email: '', rol: '', sucursal: '', zona: '' };
    for (const [clave, valor] of Object.entries(original)) {
      const campo = ALIAS_COLUMNAS[normalizarTexto(clave)];
      if (campo) fila[campo] = String(valor ?? '').trim();
    }
    if (fila.nombre || fila.apellido || fila.email || fila.rol || fila.sucursal || fila.zona) resultado.push(fila);
  });
  return resultado;
}

const ALIAS_ROLES: Record<string, UserRole> = {
  ejecutivo: 'ejecutivo',
  vendedor: 'ejecutivo',
  'jefe de local': 'jefe_local',
  'jefe local': 'jefe_local',
  logistica: 'logistica',
  operaciones: 'operaciones',
  administrador: 'administrador',
};

export function rolDesdeTexto(valor: string): UserRole | null {
  return ALIAS_ROLES[normalizarTexto(valor)] ?? null;
}

/** Busca por id numérico o por nombre (sin tildes ni mayúsculas). */
function buscarPorNombreOId<T extends { id: number; nombre: string | null }>(lista: T[], valor: string): T | null {
  const texto = valor.trim();
  if (!texto) return null;
  if (/^\d+$/.test(texto)) return lista.find((x) => x.id === Number(texto)) ?? null;
  const buscado = normalizarTexto(texto);
  return lista.find((x) => normalizarTexto(x.nombre) === buscado) ?? null;
}

/**
 * Valida todas las filas: formato, dominio, duplicados (en el archivo y con
 * las cuentas existentes), rol, sucursal y zona según las reglas de cada rol,
 * y que una sucursal no quede con dos jefes de local.
 */
export function validarFilasImportacion(filas: FilaPlantilla[], catalogo: CatalogoImportacion): FilaValidada[] {
  const emailsEnArchivo = new Map<string, number>();
  const jefesEnArchivo = new Map<number, number>();

  return filas.map((f) => {
    const errores: string[] = [];
    const email = f.email.trim().toLowerCase();

    const errorNombre = validarCampoTexto(f.nombre, 'nombre', 100);
    if (errorNombre) errores.push(errorNombre);
    const errorApellido = validarCampoTexto(f.apellido, 'apellido', 100);
    if (errorApellido) errores.push(errorApellido);

    const errorEmail = validarEmailFormato(email);
    if (errorEmail) {
      errores.push(errorEmail);
    } else {
      const errorDominio = validarDominioCorreo(email, catalogo.dominios);
      if (errorDominio) errores.push(errorDominio);
      if (catalogo.emailsExistentes.has(email)) errores.push('Ya existe una cuenta con este correo.');
      const repetida = emailsEnArchivo.get(email);
      if (repetida !== undefined) errores.push(`El correo se repite en la fila ${repetida}.`);
      else emailsEnArchivo.set(email, f.fila);
    }

    let rol = rolDesdeTexto(f.rol);
    if (!f.rol.trim()) {
      errores.push('Falta el rol.');
    } else if (!rol) {
      errores.push(`Rol desconocido: "${f.rol}". Usa Ejecutivo, Jefe de Local, Logística u Operaciones.`);
    } else if (!ROLES_IMPORTABLES.includes(rol)) {
      errores.push('Los administradores se crean de a uno desde "Registrar Nuevo Usuario".');
      rol = null;
    }

    const sucursal = buscarPorNombreOId(catalogo.sucursales, f.sucursal);
    if (f.sucursal.trim() && !sucursal) errores.push(`Sucursal no encontrada: "${f.sucursal}".`);
    const zona = buscarPorNombreOId(catalogo.zonas, f.zona);
    if (f.zona.trim() && !zona) errores.push(`Zona no encontrada: "${f.zona}".`);

    if (rol) {
      const asignacion = normalizarAsignaciones({
        rol,
        sucursal_id: sucursal?.id ?? null,
        zonas_ids: zona ? [zona.id] : [],
      });
      // Si la sucursal o la zona no se encontraron, ese error ya está arriba.
      const yaInformado = (f.sucursal.trim() && !sucursal) || (f.zona.trim() && !zona);
      if (!asignacion.ok && !yaInformado) errores.push(asignacion.error);

      if (rol === 'jefe_local' && sucursal) {
        const jefe = catalogo.sucursalesConJefe.get(sucursal.id);
        if (jefe) errores.push(`La sucursal ${sucursal.nombre ?? sucursal.id} ya tiene jefe de local (${jefe}).`);
        const otraFila = jefesEnArchivo.get(sucursal.id);
        if (otraFila !== undefined) errores.push(`La fila ${otraFila} ya asigna un jefe de local a esta sucursal.`);
        else jefesEnArchivo.set(sucursal.id, f.fila);
      }
    }

    return {
      fila: f.fila,
      email,
      nombre: f.nombre.trim(),
      apellido: f.apellido.trim(),
      rol,
      sucursal_id: sucursal?.id ?? null,
      zona_id: rol === 'logistica' ? zona?.id ?? null : null,
      errores,
    };
  });
}

/** Datos para `UsersService.createUser` de una fila válida. */
export function inputDesdeFila(f: FilaValidada): CreateUserInput {
  return {
    nombre: f.nombre,
    apellido: f.apellido,
    email: f.email,
    rol: f.rol as UserRole,
    sucursal_id: f.sucursal_id,
    sucursales_ids: [],
    zonas_ids: f.zona_id ? [f.zona_id] : [],
  };
}

/** Parte una lista en lotes del tamaño indicado. */
export function enLotes<T>(items: T[], tamano: number = TAMANO_LOTE_IMPORTACION): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

/** Filas de ejemplo de la plantilla descargable. */
export function filasEjemploPlantilla(sucursal: string, zona: string): Array<Record<string, string>> {
  return [
    { Nombre: 'Juan', Apellido: 'Pérez', Email: 'juan.perez@hmotores.cl', Rol: 'Ejecutivo', Sucursal: sucursal, Zona: '' },
    { Nombre: 'Ana', Apellido: 'Soto', Email: 'ana.soto@hmotores.cl', Rol: 'Logística', Sucursal: sucursal, Zona: zona },
  ];
}
