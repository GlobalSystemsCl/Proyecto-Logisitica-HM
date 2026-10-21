import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enLotes,
  filasDesdeExcel,
  filasEjemploPlantilla,
  inputDesdeFila,
  normalizarTexto,
  rolDesdeTexto,
  validarFilasImportacion,
  type CatalogoImportacion,
  type FilaPlantilla,
} from '@/lib/importUsuarios';

function catalogo(overrides: Partial<CatalogoImportacion> = {}): CatalogoImportacion {
  return {
    sucursales: [
      { id: 1, nombre: 'Peñalolén' },
      { id: 2, nombre: 'Concepción Centro' },
    ],
    zonas: [{ id: 7, nombre: 'Zona Sur' }],
    emailsExistentes: new Set(['ya@hmotores.cl']),
    sucursalesConJefe: new Map([[2, 'Pedro Jefe']]),
    dominios: ['hmotores.cl'],
    ...overrides,
  };
}

function fila(overrides: Partial<FilaPlantilla> = {}): FilaPlantilla {
  return {
    fila: 2,
    nombre: 'Juan',
    apellido: 'Pérez',
    email: 'juan@hmotores.cl',
    rol: 'Ejecutivo',
    sucursal: 'Peñalolén',
    zona: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizarTexto', () => {
  it('should_remove_accents_case_underscores_and_extra_spaces', () => {
    expect(normalizarTexto('  Jefe_de   LOCAL ')).toBe('jefe de local');
    expect(normalizarTexto('Logística')).toBe('logistica');
    expect(normalizarTexto(null)).toBe('');
  });
});

describe('filasDesdeExcel', () => {
  it('should_map_headers_with_accents_or_aliases_and_number_rows_from_2', () => {
    const res = filasDesdeExcel([
      { NOMBRE: ' Juan ', Apellidos: 'Pérez', 'Correo electrónico': 'j@hmotores.cl', Perfil: 'Ejecutivo', Sucursal: 'Peñalolén', Zona: '', Extra: 'x' },
    ]);
    expect(res).toEqual([
      { fila: 2, nombre: 'Juan', apellido: 'Pérez', email: 'j@hmotores.cl', rol: 'Ejecutivo', sucursal: 'Peñalolén', zona: '' },
    ]);
  });

  it('should_skip_empty_rows_keeping_original_row_numbers', () => {
    const res = filasDesdeExcel([{ Nombre: '' }, { Nombre: 'Ana', Email: 'a@hmotores.cl' }]);
    expect(res).toHaveLength(1);
    expect(res[0].fila).toBe(3);
  });
});

describe('rolDesdeTexto', () => {
  it('should_accept_labels_keys_and_vendedor_alias', () => {
    expect(rolDesdeTexto('Vendedor')).toBe('ejecutivo');
    expect(rolDesdeTexto('jefe_local')).toBe('jefe_local');
    expect(rolDesdeTexto('Jefe de Local')).toBe('jefe_local');
    expect(rolDesdeTexto('LOGÍSTICA')).toBe('logistica');
  });

  it('should_return_null_when_role_is_unknown', () => {
    expect(rolDesdeTexto('gerente')).toBeNull();
  });
});

describe('validarFilasImportacion', () => {
  it('should_accept_valid_ejecutivo_matching_branch_by_name_without_accents', () => {
    const [res] = validarFilasImportacion([fila({ sucursal: 'penalolen', email: ' Juan@HMotores.cl ' })], catalogo());
    expect(res).toEqual({
      fila: 2,
      email: 'juan@hmotores.cl',
      nombre: 'Juan',
      apellido: 'Pérez',
      rol: 'ejecutivo',
      sucursal_id: 1,
      zona_id: null,
      errores: [],
    });
  });

  it('should_accept_branch_and_zone_by_numeric_id_for_logistica', () => {
    const [res] = validarFilasImportacion([fila({ rol: 'Logística', sucursal: '1', zona: '7' })], catalogo());
    expect(res.errores).toEqual([]);
    expect(res.zona_id).toBe(7);
  });

  it('should_report_domain_existing_account_and_duplicate_in_file', () => {
    const res = validarFilasImportacion(
      [
        fila({ email: 'juan@gmail.com' }),
        fila({ fila: 3, email: 'ya@hmotores.cl' }),
        fila({ fila: 4, email: 'dup@hmotores.cl' }),
        fila({ fila: 5, email: 'DUP@hmotores.cl' }),
      ],
      catalogo()
    );
    expect(res[0].errores).toEqual(['Solo se pueden crear cuentas con correo corporativo (@hmotores.cl).']);
    expect(res[1].errores).toEqual(['Ya existe una cuenta con este correo.']);
    expect(res[2].errores).toEqual([]);
    expect(res[3].errores).toEqual(['El correo se repite en la fila 4.']);
  });

  it('should_report_missing_unknown_and_admin_roles', () => {
    const res = validarFilasImportacion(
      [fila({ rol: '' }), fila({ fila: 3, email: 'b@hmotores.cl', rol: 'Gerente' }), fila({ fila: 4, email: 'c@hmotores.cl', rol: 'Administrador' })],
      catalogo()
    );
    expect(res[0].errores).toEqual(['Falta el rol.']);
    expect(res[1].errores[0]).toMatch(/Rol desconocido: "Gerente"/);
    expect(res[2].errores).toEqual(['Los administradores se crean de a uno desde "Registrar Nuevo Usuario".']);
    expect(res[2].rol).toBeNull();
  });

  it('should_report_unknown_branch_and_zone_once', () => {
    const [res] = validarFilasImportacion([fila({ rol: 'Logística', sucursal: 'Marte', zona: 'Luna' })], catalogo());
    expect(res.errores).toEqual(['Sucursal no encontrada: "Marte".', 'Zona no encontrada: "Luna".']);
  });

  it('should_apply_role_rules_when_branch_or_zone_are_missing', () => {
    const res = validarFilasImportacion(
      [fila({ sucursal: '' }), fila({ fila: 3, email: 'b@hmotores.cl', rol: 'Logística', zona: '' })],
      catalogo()
    );
    expect(res[0].errores).toEqual(['Debes asignar la sucursal base del usuario.']);
    expect(res[1].errores).toEqual(['Un usuario de Logística debe tener exactamente una zona asignada.']);
  });

  it('should_allow_operaciones_without_branch', () => {
    const [res] = validarFilasImportacion([fila({ rol: 'Operaciones', sucursal: '' })], catalogo());
    expect(res.errores).toEqual([]);
  });

  it('should_reject_two_jefes_for_the_same_branch_in_file_or_existing', () => {
    const res = validarFilasImportacion(
      [
        fila({ rol: 'Jefe de Local', sucursal: 'Concepción Centro' }),
        fila({ fila: 3, email: 'b@hmotores.cl', rol: 'Jefe de Local', sucursal: 'Peñalolén' }),
        fila({ fila: 4, email: 'c@hmotores.cl', rol: 'Jefe de Local', sucursal: 'Peñalolén' }),
      ],
      catalogo()
    );
    expect(res[0].errores).toEqual(['La sucursal Concepción Centro ya tiene jefe de local (Pedro Jefe).']);
    expect(res[1].errores).toEqual([]);
    expect(res[2].errores).toEqual(['La fila 3 ya asigna un jefe de local a esta sucursal.']);
  });

  it('should_report_name_errors', () => {
    const [res] = validarFilasImportacion([fila({ nombre: '', apellido: '<b>' })], catalogo());
    expect(res.errores).toEqual(['El nombre es obligatorio.', 'El apellido contiene caracteres no permitidos.']);
  });
});

describe('inputDesdeFila', () => {
  it('should_build_create_user_input_with_zone_only_when_present', () => {
    const [ejecutivo, logistica] = validarFilasImportacion(
      [fila(), fila({ fila: 3, email: 'l@hmotores.cl', rol: 'Logística', zona: 'Zona Sur' })],
      catalogo()
    );
    expect(inputDesdeFila(ejecutivo)).toEqual({
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@hmotores.cl',
      rol: 'ejecutivo',
      sucursal_id: 1,
      sucursales_ids: [],
      zonas_ids: [],
    });
    expect(inputDesdeFila(logistica).zonas_ids).toEqual([7]);
  });
});

describe('enLotes', () => {
  it('should_split_in_chunks_of_given_size', () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should_return_no_chunks_when_list_is_empty', () => {
    expect(enLotes([], 20)).toEqual([]);
  });
});

describe('filasEjemploPlantilla', () => {
  it('should_use_template_columns_and_given_branch_and_zone', () => {
    const filas = filasEjemploPlantilla('Peñalolén', 'Zona Sur');
    expect(Object.keys(filas[0])).toEqual(['Nombre', 'Apellido', 'Email', 'Rol', 'Sucursal', 'Zona']);
    expect(filas[1]).toMatchObject({ Rol: 'Logística', Sucursal: 'Peñalolén', Zona: 'Zona Sur' });
  });
});
