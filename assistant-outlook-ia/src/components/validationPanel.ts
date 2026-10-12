/**
 * Affichage des vérifications : informations critiques perdues/ajoutées, corrections
 * automatiques, termes médicaux incertains, proposition IA écartée.
 */

import type { DraftOutcome } from '../ai/assistant';
import { diffStats, diffWords } from '../ai/diff';
import { button, h } from '../ui/dom';

export function validationPanel(outcome: DraftOutcome, onUseRejected?: (text: string) => void): HTMLElement {
  const v = outcome.validation;
  const items: HTMLElement[] = [];
  if (outcome.rejectionReason && outcome.rejectedAiText) {
    const details = h('details', { class: 'rejected' }, h('summary', {}, 'Voir la proposition IA écartée'), h('pre', { class: 'pre' }, outcome.rejectedAiText));
    items.push(
      h(
        'div',
        { class: 'alert alert-warn' },
        h('strong', {}, 'Proposition de l’IA écartée par sécurité. '),
        outcome.rejectionReason,
        ' La version sans IA est affichée.',
        details,
        onUseRejected ? button('Utiliser quand même la proposition IA (à relire)', () => onUseRejected(outcome.rejectedAiText!), { kind: 'ghost' }) : null,
      ),
    );
  }
  if (v.warnings.length) {
    items.push(
      h(
        'div',
        { class: 'alert alert-warn' },
        h('strong', {}, `À vérifier (${v.warnings.length})`),
        h('ul', {}, ...v.warnings.map((w) => h('li', {}, w))),
      ),
    );
  } else {
    items.push(h('div', { class: 'alert alert-ok' }, 'Dates, doses, nombres et médicaments de l’original retrouvés dans le texte rédigé.'));
  }
  for (const n of outcome.notes) items.push(h('p', { class: 'muted small' }, n));
  items.push(h('p', { class: 'muted small' }, `Moteur : ${outcome.engineLabel}${outcome.ms ? ` · ${outcome.ms} ms` : ''}`));
  return h('div', { class: 'validation' }, ...items);
}

/** Rendu de la comparaison mot à mot original → rédigé. */
export function diffView(original: string, result: string): HTMLElement {
  const ops = diffWords(original, result);
  const stats = diffStats(ops);
  return h(
    'div',
    { class: 'diff' },
    h('p', { class: 'muted small' }, `${stats.inserted} mot(s) ajouté(s), ${stats.deleted} mot(s) retiré(s).`),
    h(
      'div',
      { class: 'diff-body' },
      ...ops.map((o) => (o.type === 'equal' ? document.createTextNode(o.text) : h(o.type === 'insert' ? 'ins' : 'del', {}, o.text))),
    ),
  );
}
