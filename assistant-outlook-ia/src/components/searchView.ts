/**
 * Onglet « Rechercher ».
 *  - Dans Outlook : la question est traduite en recherche à coller dans la barre de recherche
 *    d'Outlook (le panneau n'a pas l'autorisation de parcourir la boîte : Outlook fait la recherche).
 *  - En démonstration : recherche sur des messages FICTIFS intégrés.
 */

import { DemoMailHost } from '../mock/demoHost';
import { DEMO_MESSAGES } from '../mock/messages';
import { DemoSearchProvider, ExchangeSearchProvider, highlightParts, originalWord, outlookSearchQuery, parseQuery, SERVICE_SENDERS, type SearchQuery } from '../search/search';
import type { AppContext } from '../ui/context';
import { announce, button, copyText, h, icon, replace, toast } from '../ui/dom';
import { avatar } from './avatar';

const OUTLOOK_EXAMPLES = ['mails du Dr Martin en mars', 'messages du secrétariat cette semaine', 'planning des gardes', 'documents de stage envoyés'];

/** Date de référence fixe pour que les exemples fictifs (mars 2026) restent pertinents. */
const DEMO_NOW = new Date('2026-03-15T12:00:00');
const EXAMPLES = ['mails du Dr Fictif en mars', 'amoxicilline', 'documents de stage envoyés', 'planning des gardes'];

function marked(text: string, matched: string[]): Node[] {
  return highlightParts(text, matched).map((p) => (p.mark ? h('mark', {}, p.text) : document.createTextNode(p.text)));
}

export function searchView(ctx: AppContext): HTMLElement {
  if (ctx.host.info().kind === 'office') return outlookSearchView();
  const provider = new DemoSearchProvider(DEMO_MESSAGES);
  const real = new ExchangeSearchProvider();
  const root = h('div', { class: 'view view-rechercher' });
  const input = h('input', { type: 'search', class: 'search-input', placeholder: 'Ex. : mails du Dr Fictif en mars sur le staff', 'aria-label': 'Recherche', enterkeyhint: 'search' });
  const parsed = h('div', { class: 'chips filters', 'aria-label': 'Critères compris' });
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const explain = (q: SearchQuery) => {
    const chips: Array<[string, Parameters<typeof icon>[0]]> = [];
    if (q.from) chips.push([`de : ${originalWord(q.raw, q.from)}`, 'user']);
    if (q.to) chips.push([`à : ${originalWord(q.raw, q.to)}`, 'user']);
    if (q.participant) chips.push([`avec : ${originalWord(q.raw, q.participant)}`, 'user']);
    if (q.folder) chips.push([`dossier : ${q.folder}`, 'inbox']);
    if (q.after) chips.push([`depuis le ${q.after.toLocaleDateString('fr-FR')}`, 'clock']);
    if (q.before) chips.push([`avant le ${q.before.toLocaleDateString('fr-FR')}`, 'clock']);
    const words = q.words?.length ? q.words : q.terms;
    if (words.length) chips.push([`mots-clés : ${words.join(', ')}`, 'search']);
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

/** Dans Outlook : prépare une recherche à coller dans la barre de recherche du webmail. */
function outlookSearchView(): HTMLElement {
  const root = h('div', { class: 'view view-rechercher' });
  const input = h('input', { type: 'search', class: 'search-input', placeholder: 'Ex. : mails du Dr Martin en mars sur le staff', 'aria-label': 'Recherche', enterkeyhint: 'search' });
  const out = h('div', { class: 'results', 'aria-live': 'polite' });

  const copy = async (text: string) => {
    const ok = await copyText(text);
    toast(ok ? 'Recherche copiée : collez-la dans la zone de recherche d’Outlook.' : 'Copie impossible : sélectionnez la recherche et copiez-la.', ok ? 'ok' : 'error', 6000);
  };

  const run = (text: string) => {
    if (!text.trim()) {
      input.focus();
      return;
    }
    const q = parseQuery(text, new Date(), SERVICE_SENDERS);
    const os = outlookSearchQuery(q);
    if (!os.precise && !os.simple) {
      replace(out, h('p', { class: 'results-count' }, 'Indiquez au moins un mot, un expéditeur ou une période.'));
      return;
    }
    const chips: string[] = [];
    if (q.from) chips.push(`de : ${originalWord(q.raw, q.from)}`);
    if (q.to) chips.push(`à : ${originalWord(q.raw, q.to)}`);
    if (q.participant) chips.push(`avec : ${originalWord(q.raw, q.participant)}`);
    if (q.folder) chips.push(`dossier : ${q.folder}`);
    if (q.words?.length) chips.push(`mots-clés : ${q.words.join(', ')}`);
    const legend = [
      os.precise.includes('from:') ? 'from: = expéditeur' : '',
      os.precise.includes('to:') ? 'to: = destinataire' : '',
      os.precise.includes('received:') ? 'received: = date de réception' : '',
    ].filter(Boolean);
    replace(
      out,
      h(
        'section',
        { class: 'card outlook-search' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Recherche prête pour Outlook')),
        // Un filtre par bloc insécable : « received:2026-10-06..2026-10-13 » n'est pas coupé en plein milieu.
        h('p', { class: 'query-box', 'aria-label': 'Recherche à coller' }, ...os.precise.split(' ').flatMap((t, i) => [i ? ' ' : '', h('span', { class: 'q-token' }, t)])),
        legend.length ? h('p', { class: 'muted small' }, legend.join(' · ')) : null,
        h('div', { class: 'row' }, button('Copier la recherche', () => void copy(os.precise), { kind: 'primary', icon: 'copy', id: 'btn-copy-search' })),
        h(
          'ol',
          { class: 'steps compact-steps' },
          h('li', {}, h('strong', {}, 'Copiez'), h('span', {}, 'la recherche (bouton ci-dessus).')),
          h('li', {}, h('strong', {}, 'Touchez la zone de recherche'), h('span', {}, 'd’Outlook (loupe, en haut à gauche).')),
          h('li', {}, h('strong', {}, 'Collez'), h('span', {}, 'puis validez avec Entrée (sur tablette : appui long → Coller).')),
        ),
        ...os.tips.map((t) => h('p', { class: 'muted small' }, t)),
        os.simple && os.simple !== os.precise
          ? h(
              'p',
              { class: 'muted small' },
              'Si Outlook ne trouve rien ou ne comprend pas les filtres, essayez la version simple : ',
              button(os.simple, () => void copy(os.simple), { kind: 'link', size: 'sm', title: 'Copier la version simple' }),
            )
          : null,
        chips.length ? h('div', { class: 'chips filters', 'aria-label': 'Critères compris' }, ...chips.map((c) => h('span', { class: 'chip' }, c))) : null,
      ),
    );
    announce('Recherche prête : copiez-la puis collez-la dans la barre de recherche d’Outlook.');
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run(input.value);
  });
  const submit = h('button', { type: 'button', class: 'send-btn search-go', 'aria-label': 'Préparer la recherche', title: 'Préparer la recherche' }, icon('arrow-right'));
  submit.addEventListener('click', () => run(input.value));

  root.append(
    h(
      'section',
      { class: 'hero compact' },
      h('h2', { class: 'hero-title' }, 'Retrouver un mail'),
      h('p', { class: 'hero-sub' }, 'Décrivez ce que vous cherchez : l’assistant prépare la recherche, Outlook la lance dans votre boîte.'),
    ),
    h('div', { class: 'search-box' }, icon('search'), input, submit),
    h(
      'div',
      { class: 'chips examples', role: 'group', 'aria-label': 'Exemples' },
      ...OUTLOOK_EXAMPLES.map((ex) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip chip-btn',
            onclick: () => {
              input.value = ex;
              run(ex);
            },
          },
          ex,
        ),
      ),
    ),
    out,
    h(
      'div',
      { class: 'alert alert-info demo-note' },
      icon('info'),
      h(
        'div',
        {},
        h('strong', {}, 'Pourquoi pas directement ici ? '),
        'Par sécurité, le panneau n’a accès qu’au message ouvert, pas à toute votre boîte. C’est donc Outlook qui fait la recherche. ',
        h('span', { class: 'block small' }, 'Une recherche intégrée au panneau demanderait l’accès complet à la boîte (permission « ReadWriteMailbox ») et l’accord du CHU.'),
      ),
    ),
  );
  return root;
}
