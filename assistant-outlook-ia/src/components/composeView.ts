/**
 * Onglet « Rédiger », présenté comme une conversation :
 *  - votre texte (dicté, saisi ou collé) apparaît comme un message ;
 *  - l'assistant répond par le mail mis en forme (modifiable), avec vérifications ;
 *  - la zone de saisie sert ensuite aux consignes (« plus court », « remplace X par Y »…),
 *    écrites ou dictées ; le bouton d'envoi devient « Arrêter » pendant un calcul.
 */

import { validate, type Validation } from '../ai/assistant';
import { parseCommand } from '../ai/commands';
import { resolveStyle, type Formality } from '../ai/style';
import { DemoMailHost } from '../mock/demoHost';
import { addHistory } from '../security/sessionMemory';
import { loadSettings } from '../security/settings';
import type { AppContext } from '../ui/context';
import { announce, button, copyText, h, icon, iconButton, replace, toast, type IconName } from '../ui/dom';
import { composer } from './composer';
import { insertBar, type InsertBarElement } from './insertBar';
import { segmented } from './segmented';
import { diffView, validationPanel } from './validationPanel';

type LogEntry = { role: 'user' | 'assistant'; text: string; tone?: 'ok' | 'info' | 'warn'; voice?: boolean };

/** Exemples fictifs proposés à l'accueil (aucune donnée réelle). */
const SUGGESTIONS: Array<{ icon: IconName; title: string; text: string }> = [
  {
    icon: 'clock',
    title: 'Confirmer un rendez-vous',
    text: 'bonjour docteur martin je vous confirme le staff de jeudi à 14 h 30 je viendrai avec le dossier de la chambre 12',
  },
  {
    icon: 'chat',
    title: 'Demander un avis',
    text: 'bonjour je souhaiterais votre avis sur un patient fictif de 45 ans hospitalisé pour une pneumopathie pourriez-vous passer demain matin',
  },
  {
    icon: 'file',
    title: 'Transmettre des résultats',
    text: 'bonjour voici les résultats fictifs de biologie du patient de la chambre 8 la CRP est à 45 mg/l merci de me dire si on adapte le traitement',
  },
];

const QUICK: Array<[string, string, IconName]> = [
  ['Plus court', 'plus court', 'shrink'],
  ['Plus formel', 'plus formel', 'sparkles'],
  ['Moins formel', 'moins formel', 'chat'],
  ['En liste', 'transforme en liste', 'list'],
];

export function composeView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-rediger chat-view' });
  const thread = h('div', { class: 'thread' });
  const busy = h(
    'div',
    { class: 'busy msg msg-assistant', hidden: true },
    h('div', { class: 'msg-head' }, h('span', { class: 'avatar-orb thinking-orb', 'aria-hidden': 'true' }), h('span', { class: 'busy-text thinking' }, 'Rédaction…')),
    h('pre', { class: 'stream' }),
  );
  let tab: 'redige' | 'original' | 'diff' = 'redige';
  let bar: InsertBarElement | null = null;
  let log: LogEntry[] = [];
  let composerMode: 'source' | 'command' = 'source';
  let isBusy = false;
  let validation: Validation | null = null;
  const instructions: string[] = [];
  let voicePurpose: 'compose' | 'commands' = 'compose';
  let lastSegCount = 0;
  let lastVoiceError: unknown = null;
  let validationTimer: ReturnType<typeof setTimeout> | undefined;
  const validationArea = h('div', { class: 'validation-area' });

  // --- Outils de la zone de saisie : ton, IA locale, micro ---
  const toneSel = h(
    'select',
    { class: 'pill-select', 'aria-label': 'Ton', title: 'Ton du mail' },
    h('option', { value: 'auto' }, 'Ton auto'),
    h('option', { value: 'formel' }, 'Formel'),
    h('option', { value: 'courant' }, 'Courant'),
    h('option', { value: 'familier' }, 'Collègues'),
  );
  const aiToggle = h('button', { type: 'button', class: 'pill-toggle ai-toggle', 'aria-pressed': 'false', title: 'Améliorer avec l’IA locale (expérimental)' }, icon('sparkles'), h('span', {}, 'IA'));
  aiToggle.addEventListener('click', () => {
    if (!ctx.llm.isReady()) {
      toast('Chargez d’abord un modèle IA dans « Modèles ». Le mode classique fonctionne sans IA.', 'info', 6000);
      return;
    }
    ctx.draft.useAi = !ctx.draft.useAi;
    refreshAi();
  });
  const voiceBtn = iconButton('Dicter dans la zone de saisie', 'mic', () => void toggleVoice(), { class: 'composer-mic', pressed: false });
  const toneText = h('span', { class: 'tone-info' });
  const aiText = h('span', { class: 'ai-info' });

  const comp = composer({
    placeholder: 'Décrivez votre mail, collez un texte ou dictez-le…',
    ariaLabel: 'Texte original',
    sendLabel: 'Rédiger le mail',
    sendId: 'btn-redact',
    onSubmit: (text) => void submit(text),
    onStop: () => ctx.assistant.stop(),
    tools: [toneSel, aiToggle],
    mic: voiceBtn,
    emptyMessage: 'Saisissez ou dictez d’abord un texte.',
  });

  const setBusy = (on: boolean, text = 'Rédaction…') => {
    isBusy = on;
    busy.hidden = !on;
    busy.querySelector('.busy-text')!.textContent = text;
    busy.querySelector('.stream')!.textContent = '';
    comp.setBusy(on);
  };
  const streamToken = (t: string) => {
    busy.querySelector('.stream')!.textContent += t;
  };

  const refreshAi = () => {
    const ready = ctx.llm.isReady();
    if (!ready) ctx.draft.useAi = false;
    const on = ready && ctx.draft.useAi;
    aiToggle.setAttribute('aria-pressed', String(on));
    aiToggle.classList.toggle('is-on', on);
    aiToggle.classList.toggle('is-unavailable', !ready);
    aiToggle.title = ready ? (on ? 'IA locale activée — cliquez pour revenir au mode classique' : 'Améliorer avec l’IA locale (expérimental)') : 'IA locale non chargée (voir « Modèles »)';
    replace(
      aiText,
      ready
        ? on
          ? 'IA locale activée (propositions vérifiées)'
          : 'Mode classique, IA disponible'
        : h('span', {}, 'IA locale non chargée : mode classique. ', button('Charger', () => ctx.navigate('modeles'), { kind: 'link', size: 'sm', title: 'Charger un modèle IA (onglet « Modèles »)' })),
    );
  };

  const refreshTone = async () => {
    await ctx.refreshRecipients();
    const st = resolveStyle({ recipients: ctx.recipients, formality: toneSel.value as Formality }, ctx.draft.source || comp.textarea.value);
    toneText.textContent = `Ton ${st.formality}`;
    toneText.title = `${st.reason}. Formules : « ${st.greeting} » … « ${st.closing} »`;
  };

  const refreshComposerMode = () => {
    const commands = composerMode === 'command' && !!ctx.draft.outcome;
    comp.setMode(
      commands
        ? { placeholder: 'Une modification ? « plus court », « ajoute : … »', ariaLabel: 'Consigne de modification', sendLabel: 'Appliquer la consigne' }
        : {
            placeholder: ctx.draft.outcome ? 'Modifiez le texte d’origine, puis envoyez pour régénérer' : 'Décrivez votre mail, collez un texte ou dictez-le…',
            ariaLabel: 'Texte original',
            sendLabel: ctx.draft.outcome ? 'Régénérer le mail' : 'Rédiger le mail',
          },
    );
    voicePurpose = commands ? 'commands' : 'compose';
    refreshVoice();
  };

  const refreshVoice = () => {
    const s = ctx.voiceCommands.snapshot();
    const active = s.status === 'listening' || s.status === 'starting';
    voiceBtn.classList.toggle('is-recording', active);
    voiceBtn.setAttribute('aria-pressed', String(active));
    const label = active ? 'Arrêter la dictée' : voicePurpose === 'commands' ? 'Consignes vocales (mains libres)' : 'Dicter dans la zone de saisie';
    voiceBtn.setAttribute('aria-label', label);
    voiceBtn.title = label;
  };

  const currentValidation = (): Validation | null => {
    const outcome = ctx.draft.outcome;
    if (!outcome) return null;
    if (ctx.draft.current === outcome.text) return outcome.validation;
    // Texte modifié (consigne ou saisie) : nouvelle vérification par rapport à la dictée d'origine.
    const allowed = [...ctx.recipients.map((r) => r.displayName), ...instructions];
    return validate(ctx.draft.source, ctx.draft.current, outcome.validation.corrections, allowed);
  };

  const refreshValidation = () => {
    const outcome = ctx.draft.outcome;
    if (!outcome) return replace(validationArea);
    validation = currentValidation();
    replace(
      validationArea,
      validationPanel(
        outcome,
        (t) => {
          ctx.setDraftText(t);
          refreshValidation();
          renderThread();
        },
        validation ?? outcome.validation,
      ),
    );
  };

  async function submit(text: string): Promise<void> {
    if (voicePurpose === 'compose' && ctx.voiceCommands.isCapturing()) {
      await ctx.voiceCommands.stop();
      text = comp.textarea.value.trim() || text;
    }
    comp.setValue('');
    if (composerMode === 'command' && ctx.draft.outcome) await runCommand(text);
    else await generate(text);
  }

  async function generate(raw: string): Promise<void> {
    const source = raw.trim();
    if (!source) return toast('Saisissez ou dictez d’abord un texte.', 'error');
    if (isBusy) return;
    ctx.draft.source = source;
    ctx.draft.formality = toneSel.value as Formality;
    ctx.draft.outcome = null;
    log = [];
    instructions.length = 0;
    tab = 'redige';
    const useAi = ctx.draft.useAi && ctx.llm.isReady();
    setBusy(true, useAi ? 'Rédaction par l’IA locale… (jusqu’à une minute)' : 'Rédaction…');
    renderThread();
    await ctx.refreshRecipients();
    const style = { recipients: ctx.recipients, formality: ctx.draft.formality };
    const dictatedPunctuation = loadSettings().dictatedPunctuation;
    try {
      const outcome = await ctx.assistant.draftFromDictation(source, style, { useAi, onToken: streamToken, dictatedPunctuation });
      ctx.draft.outcome = outcome;
      ctx.draft.versions = [];
      ctx.draft.current = '';
      ctx.setDraftText(outcome.text, false);
      addHistory({ kind: 'draft', label: outcome.engineLabel, original: source, result: outcome.text });
      announce(outcome.stopped ? 'Génération IA arrêtée : version sans IA affichée.' : 'Mail rédigé. Relisez-le, puis insérez-le dans Outlook.');
    } catch (e) {
      toast(`La rédaction a échoué : ${e instanceof Error ? e.message : 'erreur'}. Mode classique conservé.`, 'error', 7000);
      const outcome = await ctx.assistant.draftFromDictation(source, style, { useAi: false, dictatedPunctuation });
      ctx.draft.outcome = outcome;
      ctx.setDraftText(outcome.text, false);
    } finally {
      setBusy(false);
      composerMode = 'command';
      refreshComposerMode();
      void refreshTone();
      refreshValidation();
      renderThread();
    }
  }

  async function runCommand(input: string, fromVoice = false): Promise<void> {
    const text = ctx.draft.current;
    if (!text.trim()) return toast('Rédigez d’abord un mail.', 'error');
    if (isBusy) return toast('Patientez : une modification est en cours.', 'info');
    const cmd = parseCommand(input);
    if (cmd.kind === 'undo') return doUndo();
    if (cmd.kind === 'insert') {
      root.querySelector<HTMLButtonElement>('#btn-insert-draft')?.click();
      return;
    }
    if (cmd.kind === 'stop-listening') {
      await ctx.voiceCommands.stop();
      return;
    }
    log.push({ role: 'user', text: input, voice: fromVoice });
    setBusy(true, 'Application de la consigne…');
    renderThread();
    try {
      const r = await ctx.assistant.applyCommand(text, cmd, { useAi: ctx.draft.useAi && ctx.llm.isReady(), onToken: streamToken });
      if (r.applied) {
        ctx.setDraftText(r.text);
        instructions.push(cmd.instruction);
        addHistory({ kind: 'command', label: input, original: text, result: r.text });
      }
      log.push({ role: 'assistant', text: r.message, tone: r.applied ? 'ok' : r.stopped ? 'info' : 'warn' });
      announce(r.message);
    } catch (e) {
      log.push({ role: 'assistant', text: `Échec : ${e instanceof Error ? e.message : 'erreur'}`, tone: 'warn' });
    } finally {
      setBusy(false);
      refreshValidation();
      renderThread();
    }
  }

  function doUndo(): void {
    const ok = ctx.undo();
    const msg = ok ? 'Version précédente restaurée.' : 'Aucune version précédente.';
    toast(msg, 'info');
    announce(msg);
    refreshValidation();
    renderThread();
  }

  function newDraft(): void {
    if (isBusy) ctx.assistant.stop();
    ctx.draft.source = '';
    ctx.draft.outcome = null;
    ctx.draft.current = '';
    ctx.draft.versions = [];
    log = [];
    instructions.length = 0;
    composerMode = 'source';
    refreshComposerMode();
    refreshValidation();
    renderThread();
    comp.focus();
  }

  // --- Dictée dans la zone de saisie, ou consignes vocales mains libres ---
  async function toggleVoice(): Promise<void> {
    if (!ctx.asr.isReady()) {
      toast('Chargez d’abord un modèle de transcription (onglet « Dicter » ou « Modèles »).', 'error', 6000);
      return;
    }
    const st = ctx.voiceCommands.snapshot().status;
    if (st === 'listening' || st === 'starting' || st === 'paused') {
      await ctx.voiceCommands.stop();
      return;
    }
    ctx.voiceCommands.reset();
    lastSegCount = 0;
    lastVoiceError = null;
    await ctx.voiceCommands.start();
  }
  ctx.voiceCommands.onChange((s) => {
    refreshVoice();
    const finals = s.segments.filter((x) => x.status === 'final');
    while (lastSegCount < finals.length) {
      const said = finals[lastSegCount++].text.trim();
      if (!said) continue;
      if (voicePurpose === 'compose') comp.setValue([comp.textarea.value.trim(), said].filter(Boolean).join(' '));
      else void runCommand(said, true);
    }
    if (s.error && s.error !== lastVoiceError) {
      lastVoiceError = s.error;
      toast(s.error.message, 'error', 7000);
    }
  });

  // --- Rendu du fil ---
  function welcome(): HTMLElement {
    return h(
      'section',
      { class: 'welcome' },
      h('span', { class: 'welcome-orb', 'aria-hidden': 'true' }, icon('sparkles')),
      h('h2', { class: 'hero-title' }, 'Que souhaitez-vous écrire ?'),
      h('p', { class: 'hero-sub' }, 'Décrivez votre message en quelques mots, collez un texte ou dictez-le : l’assistant le met en forme, sans jamais rien envoyer.'),
      h(
        'div',
        { class: 'suggestions', role: 'group', 'aria-label': 'Exemples fictifs' },
        ...SUGGESTIONS.map((s) =>
          h(
            'button',
            {
              type: 'button',
              class: 'suggestion',
              onclick: () => {
                comp.setValue(s.text);
                comp.focus();
              },
            },
            h('span', { class: 'suggestion-icon', 'aria-hidden': 'true' }, icon(s.icon)),
            h('span', { class: 'suggestion-text' }, h('strong', {}, s.title), h('span', {}, 'Exemple fictif')),
          ),
        ),
        h(
          'button',
          { type: 'button', class: 'suggestion', onclick: () => ctx.navigate('dicter') },
          h('span', { class: 'suggestion-icon', 'aria-hidden': 'true' }, icon('mic')),
          h('span', { class: 'suggestion-text' }, h('strong', {}, 'Dicter plutôt'), h('span', {}, 'Transcription sur ce poste')),
        ),
      ),
      h('p', { class: 'tip' }, h('kbd', {}, 'Entrée'), ' envoyer · ', h('kbd', {}, 'Maj'), '+', h('kbd', {}, 'Entrée'), ' nouvelle ligne'),
    );
  }

  function userBubble(text: string, editable: boolean, voice = false): HTMLElement {
    return h(
      'div',
      { class: 'msg msg-user' },
      h('div', { class: 'bubble' }, voice ? h('span', { class: 'bubble-tag' }, icon('mic'), 'dicté') : null, text),
      editable
        ? iconButton('Modifier le texte d’origine', 'pencil', () => {
            composerMode = 'source';
            comp.setValue(ctx.draft.source);
            refreshComposerMode();
            comp.focus();
          }, { class: 'bubble-edit' })
        : null,
    );
  }

  function assistantNote(e: LogEntry): HTMLElement {
    return h(
      'div',
      { class: `msg msg-assistant note note-${e.tone ?? 'info'}` },
      h('span', { class: 'avatar-orb small', 'aria-hidden': 'true' }),
      h('p', {}, e.text),
    );
  }

  function draftMessage(): HTMLElement {
    const outcome = ctx.draft.outcome!;
    const tabs = segmented(
      [
        ['redige', 'Version rédigée'],
        ['original', 'Original'],
        ['diff', 'Différences'],
      ] as const,
      tab,
      (v) => {
        tab = v;
        renderThread();
      },
      { label: 'Affichage du mail' },
    );
    let body: HTMLElement;
    if (tab === 'redige') {
      const ta = h('textarea', { class: 'editor result', 'aria-label': 'Version rédigée (modifiable)', spellcheck: true });
      ta.value = ctx.draft.current;
      let committed = ta.value;
      const fit = () => {
        ta.style.height = 'auto';
        ta.style.height = `${Math.max(140, ta.scrollHeight + 2)}px`;
      };
      requestAnimationFrame(fit);
      ta.addEventListener('input', () => {
        fit();
        ctx.draft.current = ta.value;
        clearTimeout(validationTimer);
        validationTimer = setTimeout(refreshValidation, 700);
      });
      // Une version est mémorisée à la fin d'une modification manuelle (pour « Annuler »).
      ta.addEventListener('change', () => {
        if (ta.value !== committed) {
          ctx.draft.versions.push(committed);
          if (ctx.draft.versions.length > 20) ctx.draft.versions.shift();
          committed = ta.value;
          const undo = root.querySelector<HTMLButtonElement>('#btn-undo');
          if (undo) undo.disabled = false;
        }
      });
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
    bar = insertBar(ctx, () => ctx.draft.current, 'draft');
    return h(
      'article',
      { class: 'msg msg-assistant', 'aria-label': 'Proposition de l’assistant' },
      h(
        'div',
        { class: 'msg-head' },
        h('span', { class: 'avatar-orb', 'aria-hidden': 'true' }),
        h('strong', {}, 'Assistant'),
        h('span', { class: `chip ${outcome.engine === 'ia' ? 'chip-accent' : ''}` }, outcome.engine === 'ia' ? icon('sparkles') : null, outcome.engine === 'ia' ? 'IA locale' : 'Mode classique'),
      ),
      h('div', { class: 'draft-card' }, tabs, h('div', { class: 'draft-body' }, body)),
      h(
        'div',
        { class: 'msg-actions' },
        iconButton('Copier le mail', 'copy', () => {
          void copyText(ctx.draft.current).then((ok) => toast(ok ? 'Mail copié.' : 'Copie impossible.', ok ? 'ok' : 'error'));
        }),
        iconButton('Annuler la dernière modification', 'undo', () => doUndo(), { id: 'btn-undo', disabled: !ctx.draft.versions.length }),
        iconButton('Régénérer depuis le texte d’origine', 'reset', () => void generate(ctx.draft.source)),
        h('span', { class: 'spacer' }),
        button('Nouveau mail', () => newDraft(), { kind: 'ghost', icon: 'new-draft', size: 'sm' }),
      ),
      validationArea,
      h(
        'div',
        { class: 'quick-chips', role: 'group', 'aria-label': 'Modifications rapides' },
        ...QUICK.map(([label, cmd, ic]) => button(label, () => void runCommand(cmd), { kind: 'ghost', icon: ic, size: 'sm', class: 'chip-btn' })),
      ),
      h('div', { class: 'insert-card' }, bar, demoPreview),
    );
  }

  function renderThread(): void {
    bar?.dispose();
    bar = null;
    if (!ctx.draft.source && !isBusy) {
      replace(thread, welcome());
      return;
    }
    const items: Node[] = [userBubble(ctx.draft.source, !isBusy)];
    for (const e of log) items.push(e.role === 'user' ? userBubble(e.text, false, e.voice) : assistantNote(e));
    if (isBusy) items.push(busy);
    if (ctx.draft.outcome) items.push(draftMessage());
    replace(thread, ...items);
  }

  // --- Événements ---
  document.addEventListener('aoia:generate', () => {
    composerMode = 'source';
    comp.setValue('');
    void generate(ctx.draft.source);
  });
  ctx.on('host', () => {
    void refreshTone();
    if (ctx.draft.outcome && !isBusy) renderThread();
  });
  ctx.on('models', () => {
    refreshAi();
    refreshVoice();
  });
  toneSel.addEventListener('change', () => void refreshTone());
  comp.textarea.addEventListener('change', () => void refreshTone());

  root.append(thread, h('div', { class: 'composer-dock' }, comp.root, h('p', { class: 'composer-meta' }, toneText, aiText)));
  refreshAi();
  refreshComposerMode();
  void refreshTone();
  renderThread();
  return root;
}
