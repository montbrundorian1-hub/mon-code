/**
 * Sélecteur segmenté (onglets internes d'une vue) : rôle « tablist », flèches gauche/droite.
 * La vue appelante peut reconstruire le sélecteur : le focus clavier est alors restauré.
 */

import { h, icon, type IconName } from '../ui/dom';

export function segmented<T extends string>(
  items: ReadonlyArray<readonly [T, string, IconName?]>,
  current: T,
  onChange: (value: T) => void,
  opts: { label: string; class?: string },
): HTMLElement {
  const list = h('div', { class: `segmented${opts.class ? ` ${opts.class}` : ''}`, role: 'tablist', 'aria-label': opts.label });
  const values = items.map(([v]) => v);
  const refocus = (value: T) =>
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll<HTMLElement>('[role="tablist"]')]
        .find((t) => t.getAttribute('aria-label') === opts.label)
        ?.querySelector<HTMLElement>(`[data-value="${value}"]`);
      target?.focus();
    });
  for (const [value, label, ic] of items) {
    const selected = value === current;
    const b = h(
      'button',
      { type: 'button', role: 'tab', class: `tab-inline${selected ? ' active' : ''}`, 'aria-selected': String(selected), tabindex: selected ? '0' : '-1', dataset: { value } },
      ic ? icon(ic) : null,
      h('span', {}, label),
    );
    b.addEventListener('click', () => onChange(value));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = values.indexOf(value);
      const next = values[(i + (e.key === 'ArrowRight' ? 1 : values.length - 1)) % values.length];
      onChange(next);
      refocus(next);
    });
    list.append(b);
  }
  return list;
}
