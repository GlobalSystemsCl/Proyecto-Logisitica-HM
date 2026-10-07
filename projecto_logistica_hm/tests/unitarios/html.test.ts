import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/lib/html';

describe('escapeHtml', () => {
  it('should_escape_tags_and_quotes', () => {
    expect(escapeHtml('<a href="https://x">Click</a>')).toBe(
      '&lt;a href=&quot;https://x&quot;&gt;Click&lt;/a&gt;'
    );
    expect(escapeHtml("O'Higgins & Cía")).toBe('O&#39;Higgins &amp; Cía');
  });

  it('should_return_same_text_when_there_is_nothing_to_escape', () => {
    expect(escapeHtml('Juan Pérez')).toBe('Juan Pérez');
  });

  it('should_return_empty_string_when_value_is_null_or_undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('should_stringify_non_string_values', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
