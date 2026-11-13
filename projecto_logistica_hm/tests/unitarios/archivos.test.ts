import { describe, expect, it } from 'vitest';
import { ACEPTA_DOCUMENTOS, admiteVistaPrevia, esImagen, TAMANO_MAXIMO_DOCUMENTO, TIPOS_DOCUMENTO, extensionDe, revisarArchivoElegido, validarContenidoArchivo } from '@/lib/archivos';

const bytes = (...valores: number[]) => new Uint8Array(valores);
const texto = (t: string) => new TextEncoder().encode(t);

const PDF = texto('%PDF-1.7\n...');
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const WEBP = texto('RIFF\x00\x00\x00\x00WEBPVP8 ');
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00);

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('extensionDe', () => {
  it('should_return_lowercase_extension_when_name_has_one', () => {
    expect(extensionDe('Contrato.PDF')).toBe('pdf');
    expect(extensionDe('a.b.xlsx')).toBe('xlsx');
  });

  it('should_return_empty_when_name_has_no_extension', () => {
    expect(extensionDe('archivo')).toBe('');
    expect(extensionDe('.env')).toBe('');
    expect(extensionDe('archivo.')).toBe('');
  });
});

describe('validarContenidoArchivo', () => {
  it('should_accept_real_files_when_signature_and_extension_match', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', PDF)).toBeNull();
    expect(validarContenidoArchivo('a.png', 'image/png', PNG)).toBeNull();
    expect(validarContenidoArchivo('a.jpg', 'image/jpeg', JPEG)).toBeNull();
    expect(validarContenidoArchivo('a.jpeg', 'image/jpeg', JPEG)).toBeNull();
    expect(validarContenidoArchivo('a.webp', 'image/webp', WEBP)).toBeNull();
    expect(validarContenidoArchivo('a.xlsx', XLSX, ZIP)).toBeNull();
    expect(validarContenidoArchivo('a.xls', 'application/vnd.ms-excel', OLE)).toBeNull();
  });

  it('should_reject_types_removed_on_2026_11_03', () => {
    expect(validarContenidoArchivo('a.docx', DOCX, ZIP)).toBe('El tipo del archivo "a.docx" no está permitido.');
    expect(validarContenidoArchivo('a.zip', 'application/zip', ZIP)).toBe('El tipo del archivo "a.zip" no está permitido.');
    expect(validarContenidoArchivo('a.csv', 'text/csv', texto('x'))).toBe('El tipo del archivo "a.csv" no está permitido.');
    expect(validarContenidoArchivo('a.heic', 'image/heic', bytes(0x00))).toBe('El tipo del archivo "a.heic" no está permitido.');
  });

  it('should_reject_xls_without_ole_signature', () => {
    expect(validarContenidoArchivo('a.xls', 'application/vnd.ms-excel', ZIP)).toBe(
      'El contenido del archivo "a.xls" no corresponde a su tipo.'
    );
  });

  it('should_accept_arraybuffer_input', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', PDF.buffer.slice(0) as ArrayBuffer)).toBeNull();
  });

  it('should_reject_executable_declared_as_pdf', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', EXE)).toBe(
      'El contenido del archivo "a.pdf" no corresponde a su tipo.'
    );
  });

  it('should_reject_when_extension_does_not_match_mime', () => {
    expect(validarContenidoArchivo('virus.exe', 'application/pdf', PDF)).toBe(
      'La extensión del archivo "virus.exe" no corresponde a su tipo.'
    );
  });

  it('should_reject_when_mime_is_not_allowed', () => {
    expect(validarContenidoArchivo('a.html', 'text/html', texto('<html>'))).toBe(
      'El tipo del archivo "a.html" no está permitido.'
    );
  });

  it('should_reject_empty_content', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', new Uint8Array())).not.toBeNull();
  });

  it('should_reject_riff_that_is_not_webp', () => {
    expect(validarContenidoArchivo('a.webp', 'image/webp', texto('RIFF\x00\x00\x00\x00WAVEfmt '))).not.toBeNull();
  });
});

describe('ACEPTA_DOCUMENTOS', () => {
  it('should_list_every_allowed_mime_type_and_extension', () => {
    for (const mime of Object.keys(TIPOS_DOCUMENTO)) expect(ACEPTA_DOCUMENTOS).toContain(mime);
    expect(ACEPTA_DOCUMENTOS.split(',')).toEqual(expect.arrayContaining(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.xls']));
    expect(ACEPTA_DOCUMENTOS).not.toContain('.zip');
  });
});

describe('revisarArchivoElegido (QA #3)', () => {
  it('should_accept_allowed_formats_within_the_size_limit', () => {
    for (const nombre of ['guia.pdf', 'foto.JPG', 'foto.jpeg', 'img.png', 'img.webp', 'stock.xlsx', 'stock.xls']) {
      expect(revisarArchivoElegido(nombre, 1024), nombre).toBeNull();
    }
  });

  it('should_reject_formats_removed_in_R11_and_heic', () => {
    for (const nombre of ['carta.docx', 'deck.pptx', 'notas.txt', 'datos.csv', 'todo.zip', 'foto.heic', 'sin_extension']) {
      expect(revisarArchivoElegido(nombre, 1024), nombre).toContain('no es un formato permitido');
    }
  });

  it('should_reject_files_over_10_mb', () => {
    expect(revisarArchivoElegido('grande.pdf', TAMANO_MAXIMO_DOCUMENTO)).toBeNull();
    expect(revisarArchivoElegido('grande.pdf', TAMANO_MAXIMO_DOCUMENTO + 1)).toBe('"grande.pdf" pesa más de 10 MB.');
  });
});

describe('admiteVistaPrevia / esImagen (QA #52)', () => {
  it('should_allow_preview_of_images_and_pdf', () => {
    expect(admiteVistaPrevia('image/png')).toBe(true);
    expect(admiteVistaPrevia('application/pdf')).toBe(true);
    expect(esImagen('image/webp')).toBe(true);
    expect(esImagen('application/pdf')).toBe(false);
  });

  it('should_reject_excel_html_svg_and_missing_types', () => {
    expect(admiteVistaPrevia('application/vnd.ms-excel')).toBe(false);
    expect(admiteVistaPrevia('text/html')).toBe(false);
    expect(admiteVistaPrevia('image/svg+xml')).toBe(false);
    expect(esImagen('image/svg+xml')).toBe(false);
    expect(admiteVistaPrevia(null)).toBe(false);
  });
});
