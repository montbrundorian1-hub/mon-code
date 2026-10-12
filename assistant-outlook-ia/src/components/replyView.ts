/**
 * Onglet « Répondre » : analyse d'un message reçu (fictif en démonstration, ou message ouvert
 * dans Outlook sur action explicite), puis trois modes : proposition automatique,
 * réponse guidée par dictée/saisie, assistant conversationnel.
 */

import { analyzeMail, autoReplySkeleton, type MailAnalysis } from '../ai/analyze';
import type { DraftOutcome } from '../ai/assistant';
import type { ChatMessage } from '../ai/prompts';
import { resolveStyle } from '../ai/style';
import { DemoMailHost } from '../mock/demoHost';
import { DEMO_MESSAGES } from '../mock/messages';
import { addHistory } from '../security/sessionMemory';
import type { AppContext } from '../ui/context';
import { button, h, replace, toast } from '../ui/dom';
import { insertBar } from './insertBar';
import { validationPanel } from './validationPanel';

type Mode = 'auto' | 'guide' | 'chat';

export function replyView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-repondre' });
  let received: { from: string; subject: string; body: string } | null = null;
  let analysis: MailAnalysis | null = null;
  let mode: Mode = 'guide';
  let outcome: DraftOutcome | null = null;
  let current = '';
  const chat: ChatMessage[] = [];

  const sourceArea = h('section', { class: 'card' });
  const analysisArea = h('div');
  const workArea = h('div');
  const resultArea = h('div');

  const intentions = h('textarea', { class: 'editor', rows: 4, placeholder: 'Vos intentions de réponse (ex. fictif : « oui pour jeudi, j’apporte les résultats de biologie »)', 'aria-label': 'Intentions de réponse' }) as HTMLTextAreaElement;

  function renderSource(): void {
    const info = ctx.host.info();
    if (ctx.host instanceof DemoMailHost) {
      const demo = ctx.host;
      const sel = h(
        'select',
        { 'aria-label': 'Message fictif', onchange: (e: Event) => demo.select((e.target as HTMLSelectElement).value) },
        ...DEMO_MESSAGES.filter((m) => m.folder === 'reçus').map((m) => h('option', { value: m.id, selected: m.id === demo.selected.id }, `${m.from.displayName} — ${m.subject}`)),
      );
      replace(
        sourceArea,
        h('h3', {}, 'Message reçu (fictif)'),
        h('p', { class: 'muted small' }, 'Démonstration : choisissez un message inventé. Aucune boîte réelle n’est consultée.'),
        sel,
        button(
          'Analyser ce message',
          async () => {
            demo.setMode('read');
            await load();
          },
          { kind: 'primary', id: 'btn-analyze' },
        ),
      );
      return;
    }
    if (info.mode === 'read' || info.mode === 'compose') {
      replace(
        sourceArea,
        h('h3', {}, info.mode === 'read' ? 'Message ouvert dans Outlook' : 'Réponse en cours (message cité)'),
        h(
          'p',
          { class: 'caution' },
          'Le contenu sera lu sur ce poste uniquement, analysé localement et jamais conservé. N’utilisez cette fonction sur des messages réels que si cet usage est autorisé par votre établissement.',
        ),
        button('Lire et analyser le message', () => void load(), { kind: 'primary' }),
      );
      return;
    }
    replace(sourceArea, h('h3', {}, 'Aucun message'), h('p', {}, 'Ouvrez un message dans Outlook, puis rouvrez le panneau.'));
  }

  async function load(): Promise<void> {
    try {
      const body = await ctx.host.readBody();
      const sender = await ctx.host.getSender();
      const subject = await ctx.host.getSubject();
      received = { from: sender?.displayName ?? '', subject, body: body.slice(0, 20000) };
      analysis = analyzeMail(received.body);
      outcome = null;
      current = '';
      chat.length = 0;
      await ctx.refreshRecipients();
      renderAnalysis();
      renderWork();
      renderResult();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lecture impossible.', 'error', 7000);
    }
  }

  function renderAnalysis(): void {
    if (!received || !analysis) return replace(analysisArea);
    const a = analysis;
    const summaryBox = h('div');
    replace(
      analysisArea,
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Analyse locale'),
        h('p', {}, h('strong', {}, 'De : '), received.from || 'inconnu', h('br'), h('strong', {}, 'Objet : '), received.subject || '(sans objet)'),
        h('details', {}, h('summary', {}, 'Afficher le message'), h('pre', { class: 'pre' }, received.body)),
        a.questions.length ? h('div', {}, h('strong', {}, 'Questions détectées'), h('ul', {}, ...a.questions.map((q) => h('li', {}, q)))) : h('p', { class: 'muted' }, 'Aucune question explicite détectée.'),
        a.requests.length ? h('div', {}, h('strong', {}, 'Demandes'), h('ul', {}, ...a.requests.map((q) => h('li', {}, q)))) : null,
        a.dates.length ? h('p', {}, h('strong', {}, 'Dates / heures citées : '), a.dates.join(', ')) : null,
        ctx.llm.isReady()
          ? button(
              'Résumer avec l’IA locale',
              async () => {
                replace(summaryBox, h('span', { class: 'spinner' }), ' Résumé en cours…');
                const s = await ctx.assistant.summarize(received!.body).catch(() => null);
                replace(summaryBox, s ? h('pre', { class: 'pre' }, s) : h('p', { class: 'muted' }, 'Résumé indisponible.'), h('p', { class: 'muted small' }, 'Résumé généré localement : peut être incomplet, vérifiez le message.'));
              },
              { kind: 'ghost' },
            )
          : null,
        summaryBox,
      ),
    );
  }

  function modeTabs(): HTMLElement {
    const opt = (id: Mode, label: string) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `tab-inline ${mode === id ? 'active' : ''}`,
          'aria-selected': String(mode === id),
          onclick: () => {
            mode = id;
            renderWork();
          },
        },
        label,
      );
    return h('div', { class: 'tabs-inline', role: 'tablist' }, opt('auto', 'Proposition auto'), opt('guide', 'Réponse guidée'), opt('chat', 'Assistant'));
  }

  async function produce(useIntentions: string): Promise<void> {
    if (!received) return;
    const style = { recipients: ctx.recipients, formality: 'auto' as const, isReply: true };
    outcome = await ctx.assistant.reply(received.body, useIntentions, style, { useAi: ctx.llm.isReady() });
    current = outcome.text;
    addHistory({ kind: 'reply', label: outcome.engineLabel, original: useIntentions, result: current });
    renderResult();
  }

  function renderWork(): void {
    if (!received || !analysis) return replace(workArea);
    let body: HTMLElement;
    if (mode === 'auto') {
      body = h(
        'div',
        {},
        h('p', { class: 'muted small' }, 'Trame de réponse construite à partir des questions détectées. Les réponses ne sont jamais inventées : complétez les « [à compléter] ».'),
        button(
          'Proposer une trame',
          () => {
            const st = resolveStyle({ recipients: ctx.recipients, formality: 'auto', isReply: true });
            current = [st.greeting, autoReplySkeleton(analysis!), st.closing].join('\n\n');
            outcome = {
              text: current,
              engine: 'classique',
              engineLabel: 'Trame automatique (sans IA)',
              classicText: current,
              notes: [],
              validation: { facts: { missing: [], added: [], ok: true }, coverage: 1, uncertain: [], corrections: [], warnings: [] },
            };
            renderResult();
          },
          { kind: 'primary' },
        ),
      );
    } else if (mode === 'guide') {
      const dictateBtn = button(
        'Dicter mes intentions',
        async () => {
          if (!ctx.asr.isReady()) return toast('Chargez un modèle de transcription (onglet Modèles), ou saisissez au clavier.', 'error');
          const s = ctx.voiceCommands.snapshot();
          if (s.status === 'listening') {
            const text = await ctx.voiceCommands.stop();
            intentions.value = [intentions.value, text].filter(Boolean).join(' ');
            dictateBtn.lastChild!.textContent = 'Dicter mes intentions';
          } else {
            ctx.voiceCommands.reset();
            if (await ctx.voiceCommands.start()) dictateBtn.lastChild!.textContent = 'Terminer la dictée';
          }
        },
        { icon: 'mic' },
      );
      body = h(
        'div',
        {},
        intentions,
        h('div', { class: 'row' }, dictateBtn, button('Rédiger la réponse', () => void produce(intentions.value), { kind: 'primary', icon: 'send', id: 'btn-reply' })),
        h('p', { class: 'muted small' }, ctx.llm.isReady() ? 'L’IA locale formule la réponse ; elle est vérifiée automatiquement.' : 'Sans IA : vos intentions sont mises en forme (formules d’appel et de politesse).'),
      );
    } else {
      const log = h('div', { class: 'chat-log', 'aria-live': 'polite' }, ...chat.map((m) => h('div', { class: `chat-msg ${m.role}` }, m.content)));
      const input = h('input', { type: 'text', class: 'cmd-input', placeholder: 'Ex. : « propose une réponse courte et polie »', 'aria-label': 'Message à l’assistant' }) as HTMLInputElement;
      const send = async () => {
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        if (!ctx.llm.isReady()) {
          toast('L’assistant conversationnel nécessite un modèle IA local (onglet Modèles). Utilisez la réponse guidée en attendant.', 'info', 7000);
          return;
        }
        chat.push({ role: 'user', content: q });
        renderWork();
        const ans = await ctx.assistant.chat(chat, `${received!.subject}\n${received!.body}`).catch(() => null);
        chat.push({ role: 'assistant', content: ans ?? 'Désolé, la génération a échoué.' });
        renderWork();
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && void send());
      body = h(
        'div',
        {},
        ctx.llm.isReady() ? null : h('p', { class: 'state warn' }, 'Nécessite un modèle IA local (onglet Modèles).'),
        log,
        h('div', { class: 'row' }, input, button('Envoyer', () => void send(), { icon: 'send' })),
        chat.length
          ? button(
              'Utiliser la dernière réponse de l’assistant comme brouillon',
              () => {
                const last = [...chat].reverse().find((m) => m.role === 'assistant');
                if (last) {
                  current = last.content;
                  outcome = {
                    text: current,
                    engine: 'ia',
                    engineLabel: `Assistant IA local (${ctx.assistant.aiLabel()})`,
                    classicText: current,
                    notes: ['Texte issu de la conversation : relisez-le intégralement.'],
                    validation: { facts: { missing: [], added: [], ok: true }, coverage: 1, uncertain: [], corrections: [], warnings: ['Texte libre de l’assistant : aucune vérification automatique des faits n’est possible.'] },
                  };
                  renderResult();
                }
              },
              { kind: 'ghost' },
            )
          : null,
      );
    }
    replace(workArea, h('section', { class: 'card' }, h('h3', {}, 'Rédiger la réponse'), modeTabs(), body));
  }

  function renderResult(): void {
    if (!outcome) return replace(resultArea);
    const ta = h('textarea', { class: 'editor result', rows: 10, 'aria-label': 'Réponse (modifiable)' }) as HTMLTextAreaElement;
    ta.value = current;
    ta.addEventListener('input', () => (current = ta.value));
    replace(
      resultArea,
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Prévisualisation'),
        ta,
        validationPanel(outcome, (t) => {
          current = t;
          renderResult();
        }),
        insertBar(ctx, () => current, 'reply'),
      ),
    );
  }

  root.append(sourceArea, analysisArea, workArea, resultArea);
  renderSource();
  ctx.on('host', renderSource);
  ctx.on('models', () => {
    renderAnalysis();
    renderWork();
  });
  return root;
}
