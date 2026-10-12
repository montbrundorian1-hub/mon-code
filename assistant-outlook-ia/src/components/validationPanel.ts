/**
 * Vérifications affichées sous chaque proposition : informations critiques perdues/ajoutées,
 * corrections automatiques, termes médicaux incertains, proposition IA écartée ou arrêtée.
 */

import type { DraftOutcome, Validation } from '../ai/assistant';
import { diffStats, diffWords } from '../ai/diff';
import { button, h, icon } from '../ui/dom';

export function validationPanel(outcome: DraftOutcome, onUseRejected?: (text: string) => void, validation: Validation = outcome.validation): HTMLElement {
  const v = validation;
  const items: HTMLElement[] = [];
  if (outcome.rejectionReason && outcome.rejectedAiText) {
    const rejected = outcome.rejectedAiText;
    items.push(
      h(
        'div',
        { class: 'alert alert-warn' },
        icon('shield'),
        h(
          'div',
          {},
          h('strong', {}, 'Proposition de l’IA écartée par sécurité. '),
          outcome.rejectionReason,
          ' La version sans IA est affichée.',
          h('details', { class: 'rejected' }, h('summary', {}, 'Voir la proposition IA écartée'), h('pre', { class: 'pre' }, rejected)),
          onUseRejected ? button('Utiliser quand même la proposition IA (à relire)', () => onUseRejected(rejected), { kind: 'ghost', size: 'sm' }) : null,
        ),
      ),
    );
  }
  if (outcome.stopped) items.push(h('div', { class: 'alert alert-info' }, icon('info'), h('div', {}, 'Amélioration par l’IA arrêtée : la version sans IA est conservée.')));

  const n = v.warnings.length;
  items.push(
    n
      ? h(
          'details',
          { class: 'verify verify-warn', open: true },
          h('summary', {}, icon('warn'), h('span', {}, `${n} point${n > 1 ? 's' : ''} à vérifier`)),
          h('ul', {}, ...v.warnings.map((w) => h('li', {}, w))),
        )
      : h('div', { class: 'verify verify-ok' }, icon('check-circle'), h('span', {}, 'Dates, doses, nombres et médicaments de l’original retrouvés dans le texte.')),
  );
  for (const note of outcome.notes) items.push(h('p', { class: 'muted small' }, note));
  // Durée affichée seulement si elle est perceptible (≥ 0,1 s), sinon « 0 s » serait trompeur.
  const duration = outcome.ms && outcome.ms >= 100 ? ` · ${(outcome.ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : '';
  items.push(h('p', { class: 'engine-line' }, `Moteur : ${outcome.engineLabel}${duration}`));
  return h('div', { class: 'validation' }, ...items);
}

/** Rendu de la comparaison mot à mot original → rédigé. */
export function diffView(original: string, result: string): HTMLElement {
  const ops = diffWords(original, result);
  const stats = diffStats(ops);
  return h(
    'div',
    { class: 'diff' },
    h('p', { class: 'diff-stats' }, h('span', { class: 'diff-add' }, `+${stats.inserted} mot(s)`), ' · ', h('span', { class: 'diff-del' }, `−${stats.deleted} mot(s)`)),
    h('div', { class: 'diff-body' }, ...ops.map((o) => (o.type === 'equal' ? document.createTextNode(o.text) : h(o.type === 'insert' ? 'ins' : 'del', {}, o.text)))),
  );
}
