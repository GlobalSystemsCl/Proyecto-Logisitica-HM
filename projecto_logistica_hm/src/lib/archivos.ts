/**
 * Validación del contenido real de los documentos subidos (brecha 023).
 *
 * Antes solo se comparaba `File.type`, que declara el navegador (o quien
 * arme la petición). Ahora el MIME declarado, la extensión del nombre y los
 * primeros bytes del archivo (firma o "magic bytes") deben ser coherentes.
 */

type Firma = (bytes: Uint8Array) => boolean;

const empiezaCon = (firma: number[]): Firma => (bytes) =>
  bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);

const esZip = empiezaCon([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" (zip y Office OOXML)

const esWebp: Firma = (bytes) =>
  empiezaCon([0x52, 0x49, 0x46, 0x46])(bytes) && // "RIFF"
  bytes.length >= 12 &&
  bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // "WEBP"

/** Office 97-2003 (.xls): contenedor OLE "D0 CF 11 E0 A1 B1 1A E1". */
const esOle = empiezaCon([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

interface TipoPermitido {
  extensiones: string[];
  firma: Firma;
}

/**
 * R11 (decisión del 2026-11-03): solo PDF, Excel e imágenes. Se quitaron Word,
 * PowerPoint, texto, CSV y ZIP; HEIC no se acepta. Debe coincidir con
 * `allowed_mime_types` del bucket `solicitud-documentos` (migración 20261103120000).
 */
export const TIPOS_DOCUMENTO: Record<string, TipoPermitido> = {
  'application/pdf': { extensiones: ['pdf'], firma: empiezaCon([0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  'image/png': { extensiones: ['png'], firma: empiezaCon([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/jpeg': { extensiones: ['jpg', 'jpeg'], firma: empiezaCon([0xff, 0xd8, 0xff]) },
  'image/webp': { extensiones: ['webp'], firma: esWebp },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensiones: ['xlsx'], firma: esZip },
  'application/vnd.ms-excel': { extensiones: ['xls'], firma: esOle },
};

/** Valor del `accept` del selector de archivos: tipos MIME y extensiones. */
export const ACEPTA_DOCUMENTOS = [
  ...Object.keys(TIPOS_DOCUMENTO),
  ...Object.values(TIPOS_DOCUMENTO).flatMap((t) => t.extensiones.map((e) => `.${e}`)),
].join(',');

/** Tamaño máximo de cada documento (10 MB); el servidor aplica el mismo límite. */
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

/** Texto para el usuario junto al botón de subir. */
export const TEXTO_FORMATOS_DOCUMENTO = 'PDF, Excel (.xlsx o .xls) o imagen (PNG, JPG o WEBP), hasta 10 MB cada uno.';

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  if (punto <= 0 || punto === nombre.length - 1) return '';
  return nombre.slice(punto + 1).toLowerCase();
}

/**
 * QA #3: revisión rápida al elegir un archivo, antes de subirlo (solo nombre y
 * tamaño; el contenido lo valida el servidor con `validarContenidoArchivo`).
 * Devuelve el mensaje para el usuario, o `null` si se puede adjuntar.
 */
export function revisarArchivoElegido(nombre: string, tamano: number): string | null {
  const extension = extensionDe(nombre);
  const permitido = Object.values(TIPOS_DOCUMENTO).some((t) => t.extensiones.includes(extension));
  if (!permitido) return `"${nombre}" no es un formato permitido.`;
  if (tamano > TAMANO_MAXIMO_DOCUMENTO) return `"${nombre}" pesa más de 10 MB.`;
  return null;
}

/**
 * Devuelve un mensaje de error para el usuario, o `null` si el archivo es
 * válido para el tipo declarado.
 */
export function validarContenidoArchivo(
  nombre: string,
  mimeDeclarado: string,
  contenido: ArrayBuffer | Uint8Array
): string | null {
  const tipo = TIPOS_DOCUMENTO[mimeDeclarado];
  if (!tipo) return `El tipo del archivo "${nombre}" no está permitido.`;

  if (!tipo.extensiones.includes(extensionDe(nombre))) {
    return `La extensión del archivo "${nombre}" no corresponde a su tipo.`;
  }

  const bytes = contenido instanceof Uint8Array ? contenido : new Uint8Array(contenido);
  if (!tipo.firma(bytes)) {
    return `El contenido del archivo "${nombre}" no corresponde a su tipo.`;
  }

  return null;
}

/**
 * QA #52: tipos que se pueden ver en el navegador sin descargarlos. Las
 * imágenes se muestran como miniatura y el PDF se abre en otra pestaña. Solo
 * tipos cuyo contenido se valida por firma al subir (`validarContenidoArchivo`):
 * nunca HTML ni SVG, que podrían ejecutar código si se abren en línea.
 */
export const TIPOS_VISTA_PREVIA = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;

export function admiteVistaPrevia(tipoMime: string | null | undefined): boolean {
  return (TIPOS_VISTA_PREVIA as readonly string[]).includes(tipoMime ?? '');
}

export function esImagen(tipoMime: string | null | undefined): boolean {
  return admiteVistaPrevia(tipoMime) && (tipoMime ?? '').startsWith('image/');
}
