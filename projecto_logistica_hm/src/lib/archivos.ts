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

/** Texto plano: sin bytes NUL y sin firmas de ejecutables en el inicio. */
const esTexto: Firma = (bytes) => {
  const muestra = bytes.subarray(0, 8192);
  if (muestra.includes(0x00)) return false;
  if (empiezaCon([0x4d, 0x5a])(muestra)) return false; // "MZ" ejecutable Windows
  if (empiezaCon([0x7f, 0x45, 0x4c, 0x46])(muestra)) return false; // ELF
  return true;
};

interface TipoPermitido {
  extensiones: string[];
  firma: Firma;
}

export const TIPOS_DOCUMENTO: Record<string, TipoPermitido> = {
  'application/pdf': { extensiones: ['pdf'], firma: empiezaCon([0x25, 0x50, 0x44, 0x46, 0x2d]) }, // %PDF-
  'image/png': { extensiones: ['png'], firma: empiezaCon([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/jpeg': { extensiones: ['jpg', 'jpeg'], firma: empiezaCon([0xff, 0xd8, 0xff]) },
  'image/webp': { extensiones: ['webp'], firma: esWebp },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensiones: ['docx'], firma: esZip },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensiones: ['xlsx'], firma: esZip },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extensiones: ['pptx'], firma: esZip },
  'text/plain': { extensiones: ['txt'], firma: esTexto },
  'text/csv': { extensiones: ['csv'], firma: esTexto },
  'application/zip': { extensiones: ['zip'], firma: esZip },
};

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  if (punto <= 0 || punto === nombre.length - 1) return '';
  return nombre.slice(punto + 1).toLowerCase();
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
