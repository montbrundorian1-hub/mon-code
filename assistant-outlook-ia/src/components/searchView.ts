/**
 * Onglet « Rechercher » : recherche en langage naturel sur des messages FICTIFS uniquement.
 */

import { DemoMailHost } from '../mock/demoHost';
import { DEMO_MESSAGES } from '../mock/messages';
import { DemoSearchProvider, ExchangeSearchProvider, highlightParts, parseQuery, type SearchQuery } from '../search/search';
import type { AppContext } from '../ui/context';
import { announce, button, h, icon, replace } from '../ui/dom';
import { avatar } from './avatar';

/** Date de référence fixe pour que les exemples fictifs (mars 2026) restent pertinents. */
const DEMO_NOW = new Date('2026-03-15T12:00:00');
const EXAMPLES = ['mails du Dr Fictif en mars', 'amoxicilline', 'documents de stage envoyés', 'planning des gardes'];

function marked(text: string, matched: string[]): Node[] {
  return highlightParts(text, matched).map((p) => (p.mark ? h('mark', {}, p.text) : document.createTextNode(p.text)));
}

export function searchView(ctx: AppContext): HTMLElement {
  const provider = new DemoSearchProvider(DEMO_MESSAGES);
  const real = new ExchangeSearchProvider();
  const root = h('div', { class: 'view view-rechercher' });
  const input = h('input', { type: 'search', class: 'search-input', placeholder: 'Ex. : mails du Dr Fictif en mars sur le staff', 'aria-label': 'Recherche', enterkeyhint: 'search' });
  const parsed = h('div', { class: 'chips filters', 'aria-label': 'Critères compris' });
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const explain = (q: SearchQuery) => {
    const chips: Array<[string, Parameters<typeof icon>[0]]> = [];
    if (q.from) chips.push([`de : ${q.from}`, 'user']);
    if (q.to) chips.push([`à : ${q.to}`, 'user']);
    if (q.participant) chips.push([`avec : ${q.participant}`, 'user']);
    if (q.folder) chips.push([`dossier : ${q.folder}`, 'inbox']);
    if (q.after) chips.push([`depuis le ${q.after.toLocaleDateString('fr-FR')}`, 'clock']);
    if (q.before) chips.push([`avant le ${q.before.toLocaleDateString('fr-FR')}`, 'clock']);
    if (q.terms.length) chips.push([`mots-clés : ${q.terms.join(', ')}`, 'search']);
    replace(parsed, ...chips.map(([c, ic]) => h('span', { class: 'chip' }, icon(ic), c)));
  };

  const run = async (text: string) => {
    if (!text.trim()) {
      input.focus();
      return;
    }
    const q = parseQuery(text, DEMO_NOW, provider.people);
    explain(q);
    const hits = await provider.search(q);
    const summary = hits.length ? `${hits.length} résultat${hits.length > 1 ? 's' : ''} parmi ${DEMO_MESSAGES.length} messages fictifs.` : 'Aucun message fictif ne correspond. Essayez un autre mot ou un des exemples.';
    announce(summary);
    replace(
      results,
      h('p', { class: 'results-count' }, summary),
      ...hits.map((hit) => {
        const person = hit.folder === 'envoyés' ? hit.to : hit.from;
        return h(
          'article',
          { class: 'result' },
          avatar(person, true),
          h(
            'div',
            { class: 'result-main' },
            h('div', { class: 'result-head' }, h('strong', { class: 'result-subject' }, ...marked(hit.subject, hit.matched)), h('span', { class: 'chip' }, hit.folder)),
            h('div', { class: 'result-meta' }, `${hit.folder === 'envoyés' ? 'À' : 'De'} : ${person} · ${new Date(hit.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`),
            h('p', { class: 'snippet' }, ...marked(hit.snippet, hit.matched)),
            ctx.host instanceof DemoMailHost && hit.folder === 'reçus'
              ? button(
                  'Répondre à ce message',
                  () => {
                    const demo = ctx.host as DemoMailHost;
                    demo.select(hit.id);
                    demo.setMode('read');
                    ctx.emit('host');
                    ctx.navigate('repondre');
                  },
                  { kind: 'ghost', icon: 'reply', size: 'sm' },
                )
              : null,
          ),
        );
      }),
    );
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void run(input.value);
  });
  const submit = h('button', { type: 'button', class: 'send-btn search-go', 'aria-label': 'Rechercher', title: 'Rechercher' }, icon('arrow-right'));
  submit.addEventListener('click', () => void run(input.value));

  root.append(
    h(
      'section',
      { class: 'hero compact' },
      h('h2', { class: 'hero-title' }, 'Retrouver un mail'),
      h('p', { class: 'hero-sub' }, 'Posez votre question comme à un collègue : expéditeur, période, dossier, sujet.'),
    ),
    h('div', { class: 'search-box' }, icon('search'), input, submit),
    h(
      'div',
      { class: 'chips examples', role: 'group', 'aria-label': 'Exemples' },
      ...EXAMPLES.map((ex) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip chip-btn',
            onclick: () => {
              input.value = ex;
              void run(ex);
            },
          },
          ex,
        ),
      ),
    ),
    parsed,
    results,
    h(
      'div',
      { class: 'alert alert-info demo-note' },
      icon('info'),
      h('div', {}, h('strong', {}, 'Démonstration. '), 'La recherche porte uniquement sur des messages fictifs intégrés à l’application. ', h('span', { class: 'block small' }, `Boîte réelle : ${real.unavailableReason()}`)),
    ),
  );
  return root;
}
