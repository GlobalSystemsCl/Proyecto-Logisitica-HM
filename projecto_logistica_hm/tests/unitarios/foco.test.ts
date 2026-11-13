import { describe, expect, it } from 'vitest';
import { siguienteFoco } from '@/lib/foco';

describe('siguienteFoco', () => {
  it('should_wrap_to_first_when_tabbing_past_the_last', () => {
    expect(siguienteFoco(2, 3, false)).toBe(0);
  });

  it('should_wrap_to_last_when_shift_tabbing_before_the_first', () => {
    expect(siguienteFoco(0, 3, true)).toBe(2);
  });

  it('should_enter_the_modal_when_focus_is_outside', () => {
    expect(siguienteFoco(-1, 3, false)).toBe(0);
    expect(siguienteFoco(-1, 3, true)).toBe(2);
  });

  it('should_let_the_browser_move_when_not_at_an_edge_or_when_empty', () => {
    expect(siguienteFoco(1, 3, false)).toBeNull();
    expect(siguienteFoco(0, 0, false)).toBeNull();
  });
});
