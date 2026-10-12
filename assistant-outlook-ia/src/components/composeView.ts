/**
 * Onglet « Rédiger » : texte original (dicté ou saisi) → mail structuré, comparaison,
 * commandes de modification écrites ou vocales, conversation vocale, insertion.
 */

import { parseCommand } from '../ai/commands';
import { resolveStyle, type Formality } from '../ai/style';
import { addHistory } from '../security/sessionMemory';
import type { AppContext } from '../ui/context';
import { button, h, icon, replace, toast } from '../ui/dom';
import { DemoMailHost } from '../mock/demoHost';
import { insertBar, type InsertBarElement } from './insertBar';
import { diffView, validationPanel } from './validationPanel';

export function composeView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-rediger' });
  const sourceTa = h('textarea', { class: 'editor', rows: 5, placeholder: 'Saisissez ou collez un texte fictif, ou utilisez l’onglet Dicter.', 'aria-label': 'Texte original' }) as HTMLTextAreaElement;
  const toneSel = h(
    'select',
    { 'aria-label': 'Ton' },
    h('option', { value: 'auto' }, 'Ton automatique'),
    h('option', { value: 'formel' }, 'Formel'),
    h('option', { value: 'courant' }, 'Professionnel courant'),
    h('option', { value: 'familier' }, 'Entre collègues'),
  ) as HTMLSelectElement;
  const aiBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const aiLabel = h('label', { class: 'inline' }, aiBox, h('span'));
  const toneInfo = h('p', { class: 'muted small' });
  const resultArea = h('div');
  const busy = h('div', { class: 'busy', hidden: true }, h('span', { class: 'spinner' }), h('span', { class: 'busy-text' }, 'Rédaction…'), h('pre', { class: 'stream' }));
  let tab: 'redige' | 'original' | 'diff' = 'redige';
  let bar: InsertBarElement | null = null;

  const refreshAiLabel = () => {
    const ready = ctx.llm.isReady();
    aiBox.disabled = !ready;
    if (!ready) aiBox.checked = false;
    replace(aiLabel.lastElementChild!, ready ? ` Améliorer avec l’IA locale (${ctx.assistant.aiLabel()}) — expérimental` : ' IA locale non chargée : mode classique (règles, sans IA)');
  };

  const refreshTone = async () => {
    await ctx.refreshRecipients();
    const st = resolveStyle({ recipients: ctx.recipients, formality: toneSel.value as Formality }, sourceTa.value);
    toneInfo.textContent = `Ton retenu : ${st.formality} (${st.reason.toLowerCase()}). Formule : « ${st.greeting} » … « ${st.closing} »`;
  };

  const setBusy = (on: boolean, text = 'Rédaction…') => {
    busy.hidden = !on;
    (busy.querySelector('.busy-text') as HTMLElement).textContent = text;
    (busy.querySelector('.stream') as HTMLElement).textContent = '';
  };
  const streamToken = (t: string) => {
    (busy.querySelector('.stream') as HTMLElement).textContent += t;
  };

  async function generate(): Promise<void> {
    const raw = sourceTa.value.trim();
    if (!raw) return toast('Saisissez ou dictez d’abord un texte.', 'error');
    ctx.draft.source = raw;
    ctx.draft.formality = toneSel.value as Formality;
    ctx.draft.useAi = aiBox.checked;
    await ctx.refreshRecipients();
    setBusy(true, aiBox.checked ? 'Rédaction par l’IA locale… (peut prendre jusqu’à une minute)' : 'Rédaction…');
    try {
      const outcome = await ctx.assistant.draftFromDictation(
        raw,
        { recipients: ctx.recipients, formality: ctx.draft.formality },
        { useAi: aiBox.checked, onToken: streamToken },
      );
      ctx.draft.outcome = outcome;
      ctx.draft.versions = [];
      ctx.draft.current = '';
      ctx.setDraftText(outcome.text, false);
      addHistory({ kind: 'draft', label: outcome.engineLabel, original: raw, result: outcome.text });
      tab = 'redige';
    } catch (e) {
      toast(`La rédaction a échoué : ${e instanceof Error ? e.message : 'erreur'}. Mode classique conservé.`, 'error', 7000);
      const outcome = await ctx.assistant.draftFromDictation(raw, { recipients: ctx.recipients, formality: ctx.draft.formality }, { useAi: false });
      ctx.draft.outcome = outcome;
      ctx.setDraftText(outcome.text, false);
    } finally {
      setBusy(false);
      renderResult();
    }
  }

  async function runCommand(input: string): Promise<void> {
    const text = ctx.draft.current;
    if (!text.trim()) return toast('Générez d’abord un mail.', 'error');
    const cmd = parseCommand(input);
    if (cmd.kind === 'undo') {
      toast(ctx.undo() ? 'Version précédente restaurée.' : 'Aucune version précédente.', 'info');
      return renderResult();
    }
    if (cmd.kind === 'insert') {
      (root.querySelector('#btn-insert-draft') as HTMLButtonElement | null)?.click();
      return;
    }
    if (cmd.kind === 'stop-listening') {
      await ctx.voiceCommands.stop();
      return;
    }
    setBusy(true, 'Application de la consigne…');
    try {
      const r = await ctx.assistant.applyCommand(text, cmd, { useAi: aiBox.checked, onToken: streamToken });
      if (r.applied) {
        ctx.setDraftText(r.text);
        addHistory({ kind: 'command', label: input, original: text, result: r.text });
      }
      toast(r.message, r.applied ? 'ok' : 'info', 6000);
    } catch (e) {
      toast(`Échec : ${e instanceof Error ? e.message : 'erreur'}`, 'error');
    } finally {
      setBusy(false);
      renderResult();
    }
  }

  const cmdInput = h('input', { type: 'text', class: 'cmd-input', placeholder: 'Consigne : « plus court », « ajoute : … », « remplace X par Y »', 'aria-label': 'Consigne de modification' }) as HTMLInputElement;
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && cmdInput.value.trim()) {
      void runCommand(cmdInput.value.trim());
      cmdInput.value = '';
    }
  });

  // Conversation vocale : écoute continue après activation explicite ; chaque phrase = une consigne.
  const voiceBtn = h('button', { type: 'button', class: 'btn btn-secondary', title: 'Conversation vocale (consignes dictées)' }, icon('chat'), ' Conversation vocale');
  let lastSegCount = 0;
  ctx.voiceCommands.onChange((s) => {
    const active = s.status === 'listening';
    voiceBtn.classList.toggle('btn-danger', active);
    voiceBtn.lastChild!.textContent = active ? ' Arrêter la conversation' : s.status === 'paused' ? ' Reprendre la conversation' : ' Conversation vocale';
    const finals = s.segments.filter((x) => x.status === 'final');
    while (lastSegCount < finals.length) {
      const said = finals[lastSegCount++].text.trim();
      if (said) {
        toast(`Consigne entendue : « ${said} »`, 'info');
        void runCommand(said);
      }
    }
    if (s.error) toast(s.error.message, 'error', 7000);
  });
  voiceBtn.addEventListener('click', async () => {
    if (!ctx.asr.isReady()) return toast('Chargez d’abord un modèle de transcription (onglet Modèles).', 'error');
    const st = ctx.voiceCommands.snapshot().status;
    if (st === 'listening') await ctx.voiceCommands.stop();
    else if (st === 'paused') await ctx.voiceCommands.resume();
    else {
      ctx.voiceCommands.reset();
      lastSegCount = 0;
      await ctx.voiceCommands.start();
    }
  });

  const quick = (label: string, cmd: string) => button(label, () => void runCommand(cmd), { kind: 'ghost' });

  function renderResult(): void {
    bar?.dispose();
    bar = null;
    const outcome = ctx.draft.outcome;
    if (!outcome) {
      replace(resultArea);
      return;
    }
    const tabs = h(
      'div',
      { class: 'tabs-inline', role: 'tablist' },
      ...(
        [
          ['redige', 'Version rédigée'],
          ['original', 'Original'],
          ['diff', 'Différences'],
        ] as const
      ).map(([id, label]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: `tab-inline ${tab === id ? 'active' : ''}`,
            'aria-selected': String(tab === id),
            onclick: () => {
              tab = id;
              renderResult();
            },
          },
          label,
        ),
      ),
    );
    let body: HTMLElement;
    if (tab === 'redige') {
      const ta = h('textarea', { class: 'editor result', rows: 12, 'aria-label': 'Version rédigée (modifiable)' }) as HTMLTextAreaElement;
      ta.value = ctx.draft.current;
      ta.addEventListener('change', () => ctx.setDraftText(ta.value));
      body = ta;
    } else if (tab === 'original') {
      body = h('pre', { class: 'pre' }, ctx.draft.source);
    } else {
      body = diffView(ctx.draft.source, ctx.draft.current);
    }
    const demoPreview =
      ctx.host instanceof DemoMailHost && ctx.host.mode === 'compose'
        ? h('details', { class: 'demo-draft' }, h('summary', {}, 'Brouillon Outlook simulé (démonstration)'), h('pre', { class: 'pre' }, ctx.host.fullDraft()))
        : null;
    replace(
      resultArea,
      h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Résultat'),
        tabs,
        body,
        h(
          'div',
          { class: 'row wrap' },
          quick('Plus court', 'plus court'),
          quick('Plus formel', 'plus formel'),
          quick('Moins formel', 'moins formel'),
          quick('En liste', 'transforme en liste'),
          button('Annuler', () => void runCommand('annule'), { kind: 'ghost', icon: 'undo', disabled: !ctx.draft.versions.length }),
          button('Relancer', () => void generate(), { kind: 'ghost', icon: 'reset' }),
        ),
        h('div', { class: 'row' }, cmdInput),
        h('div', { class: 'row' }, voiceBtn),
        validationPanel(outcome, (t) => {
          ctx.setDraftText(t);
          renderResult();
        }),
      ),
      h('section', { class: 'card' }, (bar = insertBar(ctx, () => ctx.draft.current, 'draft')), demoPreview),
    );
  }

  document.addEventListener('aoia:generate', () => {
    sourceTa.value = ctx.draft.source;
    aiBox.checked = ctx.draft.useAi && ctx.llm.isReady();
    void generate();
  });
  ctx.on('draft', () => {
    if (document.activeElement !== sourceTa && ctx.draft.source && !sourceTa.value) sourceTa.value = ctx.draft.source;
  });
  ctx.on('host', () => {
    void refreshTone();
    if (ctx.draft.outcome) renderResult();
  });
  ctx.on('models', refreshAiLabel);
  toneSel.addEventListener('change', () => void refreshTone());
  sourceTa.addEventListener('change', () => void refreshTone());

  root.append(
    h(
      'section',
      { class: 'card' },
      h('h3', {}, 'Texte original'),
      sourceTa,
      h('div', { class: 'row wrap' }, toneSel),
      toneInfo,
      aiLabel,
      h('div', { class: 'row' }, button('Rédiger le mail', () => void generate(), { kind: 'primary', icon: 'send', id: 'btn-redact' })),
      busy,
    ),
    resultArea,
  );
  refreshAiLabel();
  void refreshTone();
  return root;
}
