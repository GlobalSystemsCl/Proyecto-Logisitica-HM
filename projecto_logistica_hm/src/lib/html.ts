/**
 * Escapa texto para interpolarlo en HTML (brecha 022). Se usa en las
 * plantillas de correo, que se arman con template literals.
 */
const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(valor: unknown): string {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}
