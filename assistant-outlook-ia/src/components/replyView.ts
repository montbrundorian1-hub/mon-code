/**
 * Onglet « Répondre » : analyse d'un message reçu (fictif en démonstration, ou message ouvert
 * dans Outlook sur action explicite), puis trois modes : trame automatique,
 * réponse guidée par dictée/saisie, assistant conversationnel.
 */

import { analyzeMail, autoReplySkeleton, type MailAnalysis } from '../ai/analyze';
import type { DraftOutcome } from '../ai/assistant';
import type { ChatMessage } from '../ai/prompts';
import { resolveStyle } from '../ai/style';
import { DemoMailHost } from '../mock/demoHost';
import { DEMO_MESSAGES } from '../mock/messages';
import { addHistory } from '../security/sessionMemory';
import { loadSettings } from '../security/settings';
import type { AppContext } from '../ui/context';
import { announce, button, h, icon, iconButton, replace, toast } from '../ui/dom';
import { avatar } from './avatar';
import { composer } from './composer';
import { insertBar, type InsertBarElement } from './insertBar';
import { segmented } from './segmented';
import { validationPanel } from './validationPanel';

type Mode = 'auto' | 'guide' | 'chat';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function replyView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-repondre' });
  let received: { from: string; subject: string; body: string } | null = null;
  let analysis: MailAnalysis | null = null;
  let mode: Mode = 'guide';
  let outcome: DraftOutcome | null = null;
  let current = '';
  let busy = false;
  const chat: ChatMessage[] = [];
  let bar: InsertBarElement | null = null;

  const sourceArea = h('section', { class: 'card source-card' });
  const analysisArea = h('div');
  const workArea = h('div');
  const resultArea = h('div');

  // Réponse guidée : intentions saisies ou dictées (session micro dédiée).
  const dictateBtn = iconButton('Dicter mes intentions', 'mic', () => void toggleDictation(), { class: 'composer-mic', pressed: false });
  const guide = composer({
    placeholder: 'Vos intentions : « oui pour jeudi, j’apporte les résultats »',
    ariaLabel: 'Intentions de réponse',
    sendLabel: 'Rédiger la réponse',
    sendId: 'btn-reply',
    onSubmit: (text) => void produce(text),
    onStop: () => ctx.assistant.stop(),
    mic: dictateBtn,
    rows: 2,
    emptyMessage: 'Indiquez vos intentions de réponse (ou utilisez la trame automatique).',
  });
  const intentions = guide.textarea;

  async function toggleDictation(): Promise<void> {
    if (!ctx.asr.isReady()) return toast('Chargez un modèle de transcription (onglet « Dicter » ou « Modèles »), ou saisissez au clavier.', 'error', 6000);
    const session = ctx.replyDictation;
    const s = session.snapshot();
    if (s.status === 'listening' || s.status === 'paused' || s.status === 'starting') {
      const text = await session.stop();
      guide.setValue([intentions.value.trim(), text].filter(Boolean).join(' '));
      intentions.focus();
    } else {
      session.reset();
      if (!(await session.start())) toast(session.snapshot().error?.message ?? 'Micro indisponible.', 'error', 7000);
    }
  }
  ctx.replyDictation.onChange((s) => {
    const active = s.status === 'listening' || s.status === 'starting';
    dictateBtn.classList.toggle('is-recording', active);
    dictateBtn.setAttribute('aria-pressed', String(active));
    const label = active ? 'Terminer la dictée' : 'Dicter mes intentions';
    dictateBtn.setAttribute('aria-label', label);
    dictateBtn.title = label;
  });

  function renderSource(): void {
    const info = ctx.host.info();
    if (ctx.host instanceof DemoMailHost) {
      const demo = ctx.host;
      const inbox = DEMO_MESSAGES.filter((m) => m.folder === 'reçus');
      const list = h(
        'div',
        { class: 'mail-list', role: 'radiogroup', 'aria-label': 'Messages fictifs' },
        ...inbox.map((m) => {
          const input = h('input', { type: 'radio', name: 'demo-message', value: m.id, checked: m.id === demo.selected.id, class: 'sr-only' });
          input.addEventListener('change', () => {
            demo.select(m.id);
            list.querySelectorAll('.mail-item').forEach((el) => el.classList.toggle('selected', el.contains(input)));
          });
          return h(
            'label',
            { class: `mail-item${m.id === demo.selected.id ? ' selected' : ''}` },
            input,
            avatar(m.from.displayName),
            h('span', { class: 'mail-item-text' }, h('span', { class: 'mail-item-top' }, h('strong', {}, m.from.displayName), h('span', { class: 'mail-date' }, shortDate(m.date))), h('span', { class: 'mail-subject' }, m.subject)),
          );
        }),
      );
      replace(
        sourceArea,
        h('div', { class: 'card-head' }, h('h2', {}, 'Choisissez un message reçu'), h('span', { class: 'chip chip-demo' }, 'fictif')),
        h('p', { class: 'muted small' }, 'Démonstration : messages inventés. Aucune boîte réelle n’est consultée.'),
        list,
        h(
          'div',
          { class: 'row' },
          button(
            'Analyser ce message',
            async () => {
              demo.setMode('read');
              await load();
            },
            { kind: 'primary', icon: 'sparkles', id: 'btn-analyze' },
          ),
        ),
      );
      return;
    }
    if (info.mode === 'read' || info.mode === 'compose') {
      replace(
        sourceArea,
        h('div', { class: 'card-head' }, h('h2', {}, info.mode === 'read' ? 'Message ouvert dans Outlook' : 'Réponse en cours (message cité)')),
        h(
          'p',
          { class: 'caution' },
          icon('shield'),
          h('span', {}, 'Le contenu sera lu sur ce poste uniquement, analysé localement et jamais conservé. N’utilisez cette fonction sur des messages réels que si cet usage est autorisé par votre établissement.'),
        ),
        h('div', { class: 'row' }, button('Lire et analyser le message', () => void load(), { kind: 'primary', icon: 'sparkles', id: 'btn-analyze' })),
      );
      return;
    }
    replace(sourceArea, h('div', { class: 'empty-state' }, icon('inbox'), h('h2', {}, 'Aucun message ouvert'), h('p', { class: 'muted' }, 'Ouvrez un message dans Outlook, puis rouvrez le panneau.')));
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
      announce(`Message analysé : ${analysis.questions.length} question(s), ${analysis.requests.length} demande(s).`);
      analysisArea.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lecture impossible.', 'error', 7000);
    }
  }

  function renderAnalysis(): void {
    if (!received || !analysis) return replace(analysisArea);
    const a = analysis;
    const msg = received;
    const summaryBox = h('div', { class: 'summary-box', 'aria-live': 'polite' });
    replace(
      analysisArea,
      h(
        'section',
        { class: 'card mail-card' },
        h('div', { class: 'mail-head' }, avatar(msg.from), h('div', { class: 'mail-head-text' }, h('strong', {}, msg.from || 'Expéditeur inconnu'), h('span', { class: 'mail-subject' }, msg.subject || '(sans objet)'))),
        h('details', { class: 'mail-body' }, h('summary', {}, 'Afficher le message'), h('pre', { class: 'pre' }, msg.body)),
        h(
          'div',
          { class: 'keypoints' },
          h('span', { class: `chip ${a.questions.length ? 'chip-accent' : ''}` }, icon('help'), `${a.questions.length} question${a.questions.length > 1 ? 's' : ''}`),
          h('span', { class: `chip ${a.requests.length ? 'chip-accent' : ''}` }, icon('list'), `${a.requests.length} demande${a.requests.length > 1 ? 's' : ''}`),
          a.dates.length ? h('span', { class: 'chip' }, icon('clock'), a.dates.join(', ')) : null,
        ),
        a.questions.length
          ? h('div', { class: 'kp-block' }, h('h3', {}, 'Questions détectées'), h('ul', {}, ...a.questions.map((q) => h('li', {}, q))))
          : h('p', { class: 'muted small' }, 'Aucune question explicite détectée.'),
        a.requests.length ? h('div', { class: 'kp-block' }, h('h3', {}, 'Demandes'), h('ul', {}, ...a.requests.map((q) => h('li', {}, q)))) : null,
        ctx.llm.isReady()
          ? button(
              'Résumer avec l’IA locale',
              async () => {
                replace(summaryBox, h('p', { class: 'thinking' }, 'Résumé en cours…'));
                const s = await ctx.assistant.summarize(msg.body).catch(() => null);
                replace(
                  summaryBox,
                  s ? h('pre', { class: 'pre' }, s) : h('p', { class: 'muted' }, 'Résumé indisponible.'),
                  h('p', { class: 'muted small' }, 'Résumé généré localement : il peut être incomplet, vérifiez le message.'),
                );
              },
              { kind: 'ghost', icon: 'sparkles', size: 'sm' },
            )
          : null,
        summaryBox,
      ),
    );
  }

  async function produce(useIntentions: string): Promise<void> {
    if (!received || busy) return;
    busy = true;
    guide.setBusy(true);
    try {
      const style = { recipients: ctx.recipients, formality: 'auto' as const, isReply: true };
      outcome = await ctx.assistant.reply(received.body, useIntentions, style, { useAi: ctx.llm.isReady(), dictatedPunctuation: loadSettings().dictatedPunctuation });
      current = outcome.text;
      addHistory({ kind: 'reply', label: outcome.engineLabel, original: useIntentions, result: current });
      announce('Réponse rédigée. Relisez-la avant de l’ouvrir dans Outlook.');
    } finally {
      busy = false;
      guide.setBusy(false);
      renderResult();
    }
  }

  function renderWork(): void {
    if (!received || !analysis) return replace(workArea);
    const a = analysis;
    let body: HTMLElement;
    if (mode === 'auto') {
      body = h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted small' }, 'Trame de réponse construite à partir des questions détectées. Les réponses ne sont jamais inventées : complétez les « [à compléter] ».'),
        h(
          'div',
          { class: 'row' },
          button(
            'Proposer une trame',
            () => {
              const st = resolveStyle({ recipients: ctx.recipients, formality: 'auto', isReply: true });
              current = [st.greeting, autoReplySkeleton(a), st.closing].join('\n\n');
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
            { kind: 'primary', icon: 'list' },
          ),
        ),
      );
    } else if (mode === 'guide') {
      body = h(
        'div',
        { class: 'stack' },
        guide.root,
        h('p', { class: 'muted small' }, ctx.llm.isReady() ? 'L’IA locale formule la réponse ; elle est vérifiée automatiquement.' : 'Sans IA : vos intentions sont mises en forme (formules d’appel et de politesse).'),
      );
    } else {
      const msg = received;
      const log = h(
        'div',
        { class: 'thread chat-log', 'aria-live': 'polite' },
        ...chat.map((m) => (m.role === 'user' ? h('div', { class: 'msg msg-user' }, h('div', { class: 'bubble' }, m.content)) : h('div', { class: 'msg msg-assistant note' }, h('span', { class: 'avatar-orb small', 'aria-hidden': 'true' }), h('p', {}, m.content)))),
      );
      const ask = composer({
        placeholder: 'Ex. : « propose une réponse courte et polie »',
        ariaLabel: 'Message à l’assistant',
        sendLabel: 'Envoyer à l’assistant',
        clearOnSubmit: true,
        onStop: () => ctx.assistant.stop(),
        onSubmit: (q) => {
          if (!ctx.llm.isReady()) {
            toast('L’assistant conversationnel nécessite un modèle IA local (onglet « Modèles »). Utilisez la réponse guidée en attendant.', 'info', 7000);
            return;
          }
          chat.push({ role: 'user', content: q });
          renderWork();
          void ctx.assistant
            .chat(chat, `${msg.subject}\n${msg.body}`)
            .catch(() => null)
            .then((ans) => {
              chat.push({ role: 'assistant', content: ans ?? 'Désolé, la génération a échoué.' });
              renderWork();
            });
        },
      });
      body = h(
        'div',
        { class: 'stack' },
        ctx.llm.isReady() ? null : h('p', { class: 'state warn' }, icon('info'), 'Nécessite un modèle IA local (onglet Modèles).'),
        chat.length ? log : h('p', { class: 'muted small' }, 'Discutez de la réponse avec l’assistant local : il connaît le message reçu, rien n’est envoyé.'),
        ask.root,
        chat.some((m) => m.role === 'assistant')
          ? button(
              'Utiliser la dernière réponse de l’assistant comme brouillon',
              () => {
                const last = [...chat].reverse().find((m) => m.role === 'assistant');
                if (!last) return;
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
              },
              { kind: 'ghost', icon: 'file', size: 'sm' },
            )
          : null,
      );
    }
    const tabs = segmented(
      [
        ['auto', 'Trame auto', 'list'],
        ['guide', 'Guidée', 'pencil'],
        ['chat', 'Assistant', 'chat'],
      ] as const,
      mode,
      (v) => {
        mode = v;
        renderWork();
      },
      { label: 'Mode de réponse' },
    );
    replace(workArea, h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Votre réponse')), tabs, body));
  }

  function renderResult(): void {
    bar?.dispose();
    bar = null;
    if (!outcome) return replace(resultArea);
    const ta = h('textarea', { class: 'editor result', 'aria-label': 'Réponse (modifiable)', spellcheck: true });
    ta.value = current;
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(140, ta.scrollHeight + 2)}px`;
    };
    requestAnimationFrame(fit);
    ta.addEventListener('input', () => {
      current = ta.value;
      fit();
    });
    const out = outcome;
    bar = insertBar(ctx, () => current, 'reply');
    replace(
      resultArea,
      h(
        'article',
        { class: 'msg msg-assistant result-card', 'aria-label': 'Réponse proposée' },
        h('div', { class: 'msg-head' }, h('span', { class: 'avatar-orb', 'aria-hidden': 'true' }), h('strong', {}, 'Réponse proposée'), h('span', { class: `chip ${out.engine === 'ia' ? 'chip-accent' : ''}` }, out.engine === 'ia' ? 'IA locale' : 'Mode classique')),
        h('div', { class: 'draft-card' }, h('div', { class: 'draft-body' }, ta)),
        validationPanel(out, (t) => {
          current = t;
          renderResult();
        }),
        h('div', { class: 'insert-card' }, bar),
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
