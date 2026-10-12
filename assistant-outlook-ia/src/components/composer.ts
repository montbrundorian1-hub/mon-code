/**
 * Zone de saisie façon messagerie : texte qui s'agrandit, outils à gauche, micro et bouton
 * d'envoi rond à droite. Pendant un calcul, le bouton d'envoi devient « Arrêter ».
 * Entrée : envoyer · Maj+Entrée : nouvelle ligne · Ctrl+Entrée : envoyer.
 */

import { autoGrow, h, icon, toast } from '../ui/dom';

export interface ComposerOptions {
  placeholder: string;
  ariaLabel: string;
  /** Libellé du bouton d'envoi (annoncé aux lecteurs d'écran, info-bulle). */
  sendLabel: string;
  sendId?: string;
  onSubmit: (text: string) => void;
  /** Arrêt du calcul en cours (bouton « Arrêter ») ; absent : bouton inactif pendant le calcul. */
  onStop?: () => void;
  tools?: Array<HTMLElement | null>;
  mic?: HTMLElement | null;
  hint?: string | null;
  clearOnSubmit?: boolean;
  emptyMessage?: string;
  rows?: number;
}

export interface Composer {
  root: HTMLElement;
  textarea: HTMLTextAreaElement;
  setBusy(busy: boolean): void;
  setValue(value: string): void;
  setMode(m: { placeholder: string; ariaLabel: string; sendLabel: string }): void;
  focus(): void;
}

export function composer(opts: ComposerOptions): Composer {
  const textarea = h('textarea', { class: 'composer-input', rows: opts.rows ?? 1, placeholder: opts.placeholder, 'aria-label': opts.ariaLabel });
  const sendIcon = icon('arrow-up');
  const stopIcon = icon('stop', { filled: true });
  const send = h('button', { type: 'button', class: 'send-btn', id: opts.sendId, 'aria-label': opts.sendLabel, title: opts.sendLabel }, sendIcon);
  let busy = false;
  let sendLabel = opts.sendLabel;
  const fit = autoGrow(textarea);

  const refresh = () => {
    const empty = !textarea.value.trim();
    send.classList.toggle('is-busy', busy);
    if (busy) {
      send.replaceChildren(stopIcon);
      const label = opts.onStop ? 'Arrêter' : 'Calcul en cours…';
      send.setAttribute('aria-label', label);
      send.title = label;
      send.setAttribute('aria-disabled', String(!opts.onStop));
    } else {
      send.replaceChildren(sendIcon);
      send.setAttribute('aria-label', sendLabel);
      send.title = sendLabel;
      send.setAttribute('aria-disabled', String(empty));
    }
  };

  const submit = () => {
    if (busy) {
      opts.onStop?.();
      return;
    }
    const text = textarea.value.trim();
    if (!text) {
      toast(opts.emptyMessage ?? 'Saisissez d’abord un texte.', 'info');
      textarea.focus();
      return;
    }
    if (opts.clearOnSubmit) {
      textarea.value = '';
      fit();
    }
    refresh();
    opts.onSubmit(text);
  };

  send.addEventListener('click', submit);
  textarea.addEventListener('input', refresh);
  textarea.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.shiftKey && !e.ctrlKey) return; // nouvelle ligne
    e.preventDefault();
    submit();
  });

  const tools = (opts.tools ?? []).filter((t): t is HTMLElement => !!t);
  const root = h(
    'div',
    { class: 'composer' },
    textarea,
    h('div', { class: 'composer-bar' }, h('div', { class: 'composer-tools' }, ...tools), opts.mic ?? null, send),
  );
  root.addEventListener('click', (e) => {
    // Clic dans la zone vide du compositeur : focus sur la saisie (comme une messagerie).
    if (e.target === root) textarea.focus();
  });
  const wrap = h('div', { class: 'composer-wrap' }, root, opts.hint ? h('p', { class: 'composer-hint' }, opts.hint) : null);
  refresh();

  return {
    root: wrap,
    textarea,
    setBusy(b: boolean) {
      busy = b;
      textarea.setAttribute('aria-busy', String(b));
      refresh();
    },
    setValue(value: string) {
      textarea.value = value;
      fit();
      refresh();
    },
    setMode(m) {
      textarea.placeholder = m.placeholder;
      textarea.setAttribute('aria-label', m.ariaLabel);
      sendLabel = m.sendLabel;
      refresh();
    },
    focus() {
      textarea.focus();
    },
  };
}
