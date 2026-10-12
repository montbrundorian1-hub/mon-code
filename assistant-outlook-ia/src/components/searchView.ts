/**
 * Onglet « Rechercher » : recherche en langage naturel sur des messages FICTIFS uniquement.
 */

import { DEMO_MESSAGES } from '../mock/messages';
import { DemoSearchProvider, ExchangeSearchProvider, parseQuery, type SearchQuery } from '../search/search';
import { DemoMailHost } from '../mock/demoHost';
import type { AppContext } from '../ui/context';
import { button, h, replace } from '../ui/dom';

export function searchView(ctx: AppContext): HTMLElement {
  const provider = new DemoSearchProvider(DEMO_MESSAGES);
  const real = new ExchangeSearchProvider();
  const root = h('div', { class: 'view view-rechercher' });
  const input = h('input', { type: 'search', class: 'cmd-input', placeholder: 'Ex. : mails du Dr Fictif en mars sur le staff', 'aria-label': 'Recherche' }) as HTMLInputElement;
  const parsed = h('div', { class: 'chips' });
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const explain = (q: SearchQuery) => {
    const chips: string[] = [];
    if (q.from) chips.push(`expéditeur : ${q.from}`);
    if (q.to) chips.push(`destinataire : ${q.to}`);
    if (q.folder) chips.push(`dossier : ${q.folder}`);
    if (q.after) chips.push(`depuis le ${q.after.toLocaleDateString('fr-FR')}`);
    if (q.before) chips.push(`avant le ${q.before.toLocaleDateString('fr-FR')}`);
    if (q.terms.length) chips.push(`mots-clés : ${q.terms.join(', ')}`);
    replace(parsed, ...chips.map((c) => h('span', { class: 'chip' }, c)));
  };

  const run = async (text: string) => {
    // Date de référence fixe pour que les exemples fictifs (mars 2026) restent pertinents.
    const q = parseQuery(text, new Date('2026-03-15T12:00:00'));
    explain(q);
    const hits = await provider.search(q);
    replace(
      results,
      h('p', { class: 'muted small' }, `${hits.length} résultat(s) parmi ${DEMO_MESSAGES.length} messages fictifs.`),
      ...hits.map((hit) =>
        h(
          'article',
          { class: 'result' },
          h('div', { class: 'result-head' }, h('strong', {}, hit.subject), h('span', { class: 'chip' }, hit.folder)),
          h('div', { class: 'small muted' }, `${hit.folder === 'envoyés' ? 'À' : 'De'} : ${hit.folder === 'envoyés' ? hit.to : hit.from} · ${new Date(hit.date).toLocaleDateString('fr-FR')}`),
          h('p', { class: 'snippet' }, hit.snippet),
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
                { kind: 'ghost' },
              )
            : null,
        ),
      ),
    );
  };

  input.addEventListener('keydown', (e) => e.key === 'Enter' && void run(input.value));
  const examples = ['mails du Dr Fictif en mars', 'amoxicilline', 'documents de stage envoyés', 'planning des gardes'];

  root.append(
    h(
      'div',
      { class: 'alert alert-info' },
      h('strong', {}, 'Mode démonstration. '),
      'La recherche porte uniquement sur des messages fictifs intégrés à l’application. ',
      h('span', { class: 'block small' }, `Boîte réelle : ${real.unavailableReason()}`),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'row' }, input, button('Rechercher', () => void run(input.value), { kind: 'primary', icon: 'search' })),
      h(
        'div',
        { class: 'chips' },
        ...examples.map((ex) =>
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
    ),
    results,
  );
  return root;
}
