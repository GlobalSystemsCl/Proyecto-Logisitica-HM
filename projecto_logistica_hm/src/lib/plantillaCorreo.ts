import { escapeHtml } from '@/lib/html';

/**
 * Diseño común de todos los correos (avisos del flujo y correos de cuenta).
 *
 * HTML para clientes de correo: tablas, estilos en línea y ancho máximo de
 * 600 px. El logo se carga desde la app (`/correo/logo-hmotores.png`) con URL
 * absoluta: Gmail bloquea las imágenes en base64 y los SVG. Todo texto
 * variable se escapa (brecha 022). Cada correo lleva además una versión de
 * texto plano, que mejora la entrega.
 *
 * Funciones puras: no tocan la BD, la red ni React.
 */

/** Color del logo (azul marino de HMotores). */
export const COLOR_MARCA = '#091f2c';

export const RUTA_LOGO_CORREO = '/correo/logo-hmotores.png';

/** Tamaño en que se muestra el logo (la imagen es de 357 × 169). */
const LOGO_ANCHO = 120;
const LOGO_ALTO = 57;

export type TonoCorreo = 'info' | 'exito' | 'aviso' | 'alerta';

const TONOS: Record<TonoCorreo, { fondo: string; borde: string; texto: string }> = {
  info: { fondo: '#eff6ff', borde: '#bfdbfe', texto: '#1e40af' },
  exito: { fondo: '#f0fdf4', borde: '#bbf7d0', texto: '#166534' },
  aviso: { fondo: '#fffbeb', borde: '#fde68a', texto: '#92400e' },
  alerta: { fondo: '#fef2f2', borde: '#fecaca', texto: '#991b1b' },
};

/** Pasos de la barra de avance de una solicitud. */
export const PASOS_SOLICITUD = ['Creada', 'Aprobada', 'Programada', 'En camino', 'Recibida', 'Finalizada'] as const;

export interface AvisoCorreo {
  texto: string;
  tono: TonoCorreo;
}

export interface LayoutCorreo {
  /** Asunto: va en `<title>`. */
  asunto: string;
  /** Texto que la bandeja muestra junto al asunto (no se ve en el cuerpo). */
  vistaPrevia: string;
  /** Etiqueta de estado sobre el título. */
  etiqueta?: AvisoCorreo | null;
  titulo: string;
  /** Nombre del destinatario para el saludo. Vacío = "Hola." */
  nombre: string;
  parrafos: string[];
  /** Recuadro destacado bajo los párrafos (urgente, instrucciones). */
  aviso?: AvisoCorreo | null;
  /** Índice del paso actual en `PASOS_SOLICITUD`; `null` sin barra de avance. */
  paso?: number | null;
  detalles?: Array<[string, string]>;
  /** Filas de `detalles` que se muestran en letra monoespaciada (claves, correos). */
  detallesMonoespaciados?: string[];
  boton?: { texto: string; url: string } | null;
  /** Notas en letra chica bajo el botón. */
  notas?: string[];
  /** Por qué recibe el correo (pie). */
  motivoEnvio?: string | null;
  /** URL pública de la app, para el logo. */
  appUrl: string;
}

export function urlLogoCorreo(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}${RUTA_LOGO_CORREO}`;
}

function saludo(nombre: string): string {
  const n = nombre.trim();
  return n ? `Hola, ${n}.` : 'Hola.';
}

function htmlEtiqueta(e: AvisoCorreo): string {
  const t = TONOS[e.tono];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${t.fondo};border:1px solid ${t.borde};color:${t.texto};font-size:12px;font-weight:700;letter-spacing:0.2px">${escapeHtml(e.texto)}</span>`;
}

function htmlAviso(a: AvisoCorreo): string {
  const t = TONOS[a.tono];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0"><tr><td style="padding:12px 14px;border-radius:10px;background:${t.fondo};border:1px solid ${t.borde};color:${t.texto};font-size:13px;line-height:1.5;font-weight:600">${escapeHtml(a.texto)}</td></tr></table>`;
}

function htmlAvance(paso: number): string {
  const celdas = PASOS_SOLICITUD.map((nombre, i) => {
    const color = i < paso ? COLOR_MARCA : i === paso ? '#16a34a' : '#e5e7eb';
    const texto = i === paso ? '#166534' : i < paso ? '#374151' : '#9ca3af';
    const peso = i === paso ? '700' : '500';
    return (
      `<td width="16.66%" style="padding:0 2px;vertical-align:top">` +
      `<div style="height:6px;border-radius:3px;background:${color};font-size:0;line-height:0">&nbsp;</div>` +
      `<div style="padding-top:6px;font-size:10px;line-height:1.3;color:${texto};font-weight:${peso};text-align:center">${escapeHtml(nombre)}</div>` +
      `</td>`
    );
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;table-layout:fixed"><tr>${celdas}</tr></table>`;
}

function htmlDetalles(detalles: Array<[string, string]>, mono: string[]): string {
  const filas = detalles
    .map(([k, v], i) => {
      const borde = i === 0 ? '' : 'border-top:1px solid #eef0f2;';
      const fuente = mono.includes(k) ? "font-family:Consolas,'Courier New',monospace;letter-spacing:0.5px;" : '';
      return (
        `<tr><td style="${borde}padding:9px 12px 9px 0;color:#6b7280;font-size:13px;vertical-align:top;width:38%">${escapeHtml(k)}</td>` +
        `<td style="${borde}padding:9px 0;color:#111827;font-size:14px;font-weight:600;vertical-align:top;${fuente}">${escapeHtml(v)}</td></tr>`
      );
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px"><tr><td style="padding:6px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table></td></tr></table>`;
}

function htmlBoton(b: { texto: string; url: string }): string {
  const url = escapeHtml(b.url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0"><tr><td style="border-radius:10px;background:${COLOR_MARCA}">` +
    `<a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px">${escapeHtml(b.texto)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 6px 0;color:#6b7280;font-size:12px;line-height:1.5">Si el botón no funciona, copia este enlace en tu navegador:<br>` +
    `<a href="${url}" style="color:#1d4ed8;word-break:break-all">${url}</a></p>`
  );
}

/** HTML completo del correo. */
export function renderLayoutCorreo(l: LayoutCorreo): string {
  const parrafos = [saludo(l.nombre), ...l.parrafos]
    .map((p) => `<p style="margin:0 0 14px 0;color:#374151;font-size:14px;line-height:1.6">${escapeHtml(p)}</p>`)
    .join('');
  const notas = (l.notas ?? [])
    .map((n) => `<p style="margin:14px 0 0 0;color:#6b7280;font-size:12px;line-height:1.5">${escapeHtml(n)}</p>`)
    .join('');
  const motivo = l.motivoEnvio ? `${escapeHtml(l.motivoEnvio)}<br>` : '';
  const paso = l.paso ?? null;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(l.asunto)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(l.vistaPrevia)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
<tr><td style="height:5px;background:${COLOR_MARCA};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:20px 28px 16px 28px;border-bottom:1px solid #f0f1f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${escapeHtml(urlLogoCorreo(l.appUrl))}" width="${LOGO_ANCHO}" height="${LOGO_ALTO}" alt="HMotores" style="display:block;border:0;outline:none;text-decoration:none;width:${LOGO_ANCHO}px;height:auto"></td>
<td align="right" style="vertical-align:middle;color:#6b7280;font-size:11px;line-height:1.4">Gestión y Logística<br>de Vehículos</td>
</tr></table>
</td></tr>
<tr><td style="padding:26px 28px 28px 28px">
${l.etiqueta ? `<div style="margin:0 0 12px 0">${htmlEtiqueta(l.etiqueta)}</div>` : ''}
<h1 style="margin:0 0 14px 0;font-size:21px;line-height:1.3;color:#111827;font-weight:800">${escapeHtml(l.titulo)}</h1>
${parrafos}
${l.aviso ? htmlAviso(l.aviso) : ''}
${paso !== null && paso >= 0 && paso < PASOS_SOLICITUD.length ? htmlAvance(paso) : ''}
${l.detalles && l.detalles.length > 0 ? htmlDetalles(l.detalles, l.detallesMonoespaciados ?? []) : ''}
${l.boton ? htmlBoton(l.boton) : ''}
${notas}
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:1.6">${motivo}Correo automático del Sistema de Logística HMotores. No respondas a este mensaje.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Versión de texto plano del mismo correo (sin escapar: no es HTML). */
export function renderTextoPlano(l: LayoutCorreo): string {
  const bloques: string[] = [];
  bloques.push(l.etiqueta ? `${l.titulo.toUpperCase()} [${l.etiqueta.texto}]` : l.titulo.toUpperCase());
  bloques.push([saludo(l.nombre), ...l.parrafos].join('\n\n'));
  if (l.aviso) bloques.push(`>> ${l.aviso.texto}`);
  const paso = l.paso ?? null;
  if (paso !== null && paso >= 0 && paso < PASOS_SOLICITUD.length) {
    bloques.push(
      `Avance: ${PASOS_SOLICITUD.map((p, i) => (i === paso ? `[${p}]` : i < paso ? `${p} ✓` : p)).join(' > ')}`
    );
  }
  if (l.detalles && l.detalles.length > 0) bloques.push(l.detalles.map(([k, v]) => `- ${k}: ${v}`).join('\n'));
  if (l.boton) bloques.push(`${l.boton.texto}: ${l.boton.url}`);
  if (l.notas && l.notas.length > 0) bloques.push(l.notas.join('\n'));
  const pie = [l.motivoEnvio, 'Correo automático del Sistema de Logística HMotores. No respondas a este mensaje.']
    .filter(Boolean)
    .join('\n');
  bloques.push(`--\n${pie}`);
  return bloques.join('\n\n');
}
