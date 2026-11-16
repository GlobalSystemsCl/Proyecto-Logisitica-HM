import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PASOS_SOLICITUD,
  renderLayoutCorreo,
  renderTextoPlano,
  urlLogoCorreo,
  type LayoutCorreo,
} from '@/lib/plantillaCorreo';

const base: LayoutCorreo = {
  asunto: '[H.Motores] Prueba',
  vistaPrevia: 'Vista previa',
  titulo: 'Título',
  nombre: 'Ana',
  parrafos: ['Primer párrafo.'],
  appUrl: 'https://app.test',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('urlLogoCorreo', () => {
  it('should_build_absolute_logo_url_without_double_slash', () => {
    expect(urlLogoCorreo('https://app.test/')).toBe('https://app.test/correo/logo-hmotores.png');
    expect(urlLogoCorreo('https://app.test')).toBe('https://app.test/correo/logo-hmotores.png');
  });
});

describe('renderLayoutCorreo', () => {
  it('should_include_logo_title_preview_and_greeting', () => {
    const html = renderLayoutCorreo(base);
    expect(html).toContain('<title>[H.Motores] Prueba</title>');
    expect(html).toContain('src="https://app.test/correo/logo-hmotores.png"');
    expect(html).toContain('alt="HMotores"');
    expect(html).toContain('Vista previa');
    expect(html).toContain('Hola, Ana.');
    expect(html).toContain('Primer párrafo.');
  });

  it('should_greet_without_name_when_name_is_blank', () => {
    expect(renderLayoutCorreo({ ...base, nombre: '  ' })).toContain('>Hola.<');
  });

  it('should_escape_every_variable_text', () => {
    const html = renderLayoutCorreo({
      ...base,
      titulo: '<script>t</script>',
      nombre: '<b>Ana</b>',
      parrafos: ['<img src=x>'],
      detalles: [['<k>', '<v>']],
      boton: { texto: '<btn>', url: 'https://app.test/x?a=1&b="2"' },
      notas: ['<nota>'],
      motivoEnvio: '<motivo>',
      etiqueta: { texto: '<et>', tono: 'info' },
      aviso: { texto: '<av>', tono: 'alerta' },
    });
    expect(html).not.toMatch(/<(script|b|img|k|v|btn|nota|motivo|et|av)>/);
    expect(html).toContain('&lt;script&gt;t&lt;/script&gt;');
    expect(html).toContain('href="https://app.test/x?a=1&amp;b=&quot;2&quot;"');
  });

  it('should_render_progress_bar_only_with_a_valid_step', () => {
    const conPaso = renderLayoutCorreo({ ...base, paso: 2 });
    for (const paso of PASOS_SOLICITUD) expect(conPaso).toContain(`>${paso}</div>`);
    expect(renderLayoutCorreo({ ...base, paso: null })).not.toContain('>Programada</div>');
    expect(renderLayoutCorreo({ ...base, paso: 9 })).not.toContain('>Programada</div>');
  });

  it('should_render_details_button_and_fallback_link', () => {
    const html = renderLayoutCorreo({
      ...base,
      detalles: [['Solicitud', '101-15']],
      boton: { texto: 'Ver solicitud 101-15', url: 'https://app.test/s' },
    });
    expect(html).toContain('>Solicitud</td>');
    expect(html).toContain('101-15');
    expect(html).toContain('>Ver solicitud 101-15</a>');
    expect(html).toContain('Si el botón no funciona');
  });

  it('should_use_monospace_only_for_marked_rows', () => {
    const html = renderLayoutCorreo({
      ...base,
      detalles: [
        ['Rol', 'Ejecutivo'],
        ['Contraseña provisoria', 'Abc123'],
      ],
      detallesMonoespaciados: ['Contraseña provisoria'],
    });
    const fila = html.slice(html.indexOf('Abc123') - 200, html.indexOf('Abc123'));
    expect(fila).toContain('monospace');
    const filaRol = html.slice(html.indexOf('>Ejecutivo<') - 200, html.indexOf('>Ejecutivo<'));
    expect(filaRol).not.toContain('monospace');
  });

  it('should_show_reason_in_footer_when_given', () => {
    expect(renderLayoutCorreo({ ...base, motivoEnvio: 'Recibes este correo porque sí.' })).toContain('Recibes este correo porque sí.<br>');
    expect(renderLayoutCorreo(base)).toContain('Correo automático del Sistema de Logística HMotores');
  });
});

describe('renderTextoPlano', () => {
  it('should_render_title_label_details_link_and_footer', () => {
    const t = renderTextoPlano({
      ...base,
      etiqueta: { texto: 'Programada', tono: 'info' },
      detalles: [['Solicitud', '101-15']],
      boton: { texto: 'Ver solicitud', url: 'https://app.test/s' },
      motivoEnvio: 'Motivo.',
    });
    expect(t.startsWith('TÍTULO [Programada]')).toBe(true);
    expect(t).toContain('Hola, Ana.\n\nPrimer párrafo.');
    expect(t).toContain('- Solicitud: 101-15');
    expect(t).toContain('Ver solicitud: https://app.test/s');
    expect(t).toContain('--\nMotivo.\nCorreo automático');
  });

  it('should_mark_done_and_current_steps_in_progress', () => {
    const t = renderTextoPlano({ ...base, paso: 1 });
    expect(t).toContain('Avance: Creada ✓ > [Aprobada] > Programada');
  });

  it('should_include_notice_and_notes', () => {
    const t = renderTextoPlano({ ...base, aviso: { texto: 'Urgente', tono: 'alerta' }, notas: ['Nota 1'] });
    expect(t).toContain('>> Urgente');
    expect(t).toContain('Nota 1');
  });
});
