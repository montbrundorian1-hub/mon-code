/**
 * Mini-utilitaires DOM (pas de framework : panneau léger, chargement rapide).
 * Tout texte est inséré via textContent : pas d'injection HTML possible.
 */

import { icon, type IconName } from './icons';

export { icon, type IconName } from './icons';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
};

/** Valeur d'attribut : seules les valeurs simples sont converties (jamais « [object Object] »). */
function attrText(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' ? String(v) : '';
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = attrText(v);
    else if (k === 'style') el.setAttribute('style', attrText(v));
    else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : attrText(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'link';

export function button(
  label: string | Node,
  onClick: (ev: MouseEvent) => void,
  opts: { kind?: ButtonKind; icon?: IconName; title?: string; disabled?: boolean; id?: string; size?: 'sm' | 'lg'; class?: string } = {},
): HTMLButtonElement {
  const cls = ['btn', `btn-${opts.kind ?? 'secondary'}`, opts.size ? `btn-${opts.size}` : '', opts.class ?? ''].filter(Boolean).join(' ');
  const b = h('button', { type: 'button', class: cls, title: opts.title, id: opts.id }, opts.icon ? icon(opts.icon) : null, typeof label === 'string' ? h('span', { class: 'btn-label' }, label) : label);
  b.disabled = !!opts.disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** Bouton icône seule : le libellé reste annoncé (aria-label) et affiché en info-bulle. */
export function iconButton(
  label: string,
  name: IconName,
  onClick: (ev: MouseEvent) => void,
  opts: { id?: string; disabled?: boolean; class?: string; pressed?: boolean; filled?: boolean } = {},
): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `icon-btn${opts.class ? ` ${opts.class}` : ''}`, 'aria-label': label, title: label, id: opts.id }, icon(name, { filled: opts.filled }));
  if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
  b.disabled = !!opts.disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** Interrupteur accessible (case à cocher présentée en bascule, rôle « switch »). */
export function switchControl(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  opts: { disabled?: boolean; hint?: string; class?: string } = {},
): HTMLLabelElement & { input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch-input', checked, disabled: !!opts.disabled });
  input.addEventListener('change', () => onChange(input.checked));
  const lab = h(
    'label',
    { class: `switch${opts.class ? ` ${opts.class}` : ''}` },
    input,
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })),
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), opts.hint ? h('span', { class: 'switch-hint' }, opts.hint) : null),
  );
  return Object.assign(lab, { input });
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

let toastHost: HTMLElement | null = null;
export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'info', ms = 4000): void {
  if (!toastHost?.isConnected) {
    toastHost = h('section', { class: 'toasts', role: 'region', 'aria-label': 'Notifications', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const t = h('div', { class: `toast toast-${kind}` }, icon(kind === 'ok' ? 'check-circle' : kind === 'error' ? 'warn' : 'info'), h('span', {}, message));
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
}

let announcer: HTMLElement | null = null;
/** Annonce discrète pour les lecteurs d'écran (zone « live » invisible). */
export function announce(message: string): void {
  if (!announcer?.isConnected) {
    announcer = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(announcer);
  }
  const target = announcer;
  target.textContent = '';
  // Léger délai : garantit la lecture, même si le message est identique au précédent.
  setTimeout(() => (target.textContent = message), 30);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli : sélection d'un champ temporaire (presse-papiers parfois bloqué dans un iframe).
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok: boolean;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Nombre de lignes adapté au contenu (évite les grands vides et les barres de défilement inutiles). */
export function autoRows(text: string, min = 4, max = 18, charsPerLine = 46): number {
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
  return Math.max(min, Math.min(max, lines + 1));
}

/** Zone de saisie qui s'agrandit avec son contenu (jusqu'à `maxPx`), comme une messagerie. */
export function autoGrow(ta: HTMLTextAreaElement, maxPx = 220): () => void {
  const fit = () => {
    if (!ta.isConnected) return;
    ta.style.height = 'auto';
    const next = Math.min(maxPx, ta.scrollHeight);
    if (next > 0) ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxPx ? 'auto' : 'hidden';
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}
