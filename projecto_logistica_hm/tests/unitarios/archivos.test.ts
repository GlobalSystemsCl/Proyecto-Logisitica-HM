import { describe, expect, it } from 'vitest';
import { extensionDe, validarContenidoArchivo } from '@/lib/archivos';

const bytes = (...valores: number[]) => new Uint8Array(valores);
const texto = (t: string) => new TextEncoder().encode(t);

const PDF = texto('%PDF-1.7\n...');
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00);
const WEBP = texto('RIFF\x00\x00\x00\x00WEBPVP8 ');
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
    expect(validarContenidoArchivo('a.docx', DOCX, ZIP)).toBeNull();
    expect(validarContenidoArchivo('a.zip', 'application/zip', ZIP)).toBeNull();
    expect(validarContenidoArchivo('a.csv', 'text/csv', texto('patente;chasis\nAB12;X1'))).toBeNull();
  });

  it('should_accept_arraybuffer_input', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', PDF.buffer.slice(0) as ArrayBuffer)).toBeNull();
  });

  it('should_reject_executable_declared_as_pdf', () => {
    expect(validarContenidoArchivo('a.pdf', 'application/pdf', EXE)).toBe(
      'El contenido del archivo "a.pdf" no corresponde a su tipo.'
    );
  });

  it('should_reject_executable_declared_as_text', () => {
    expect(validarContenidoArchivo('a.txt', 'text/plain', EXE)).toBe(
      'El contenido del archivo "a.txt" no corresponde a su tipo.'
    );
  });

  it('should_reject_binary_with_nul_bytes_declared_as_csv', () => {
    expect(validarContenidoArchivo('a.csv', 'text/csv', bytes(0x41, 0x00, 0x42))).not.toBeNull();
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
