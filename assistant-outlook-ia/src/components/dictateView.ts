/**
 * Onglet « Dicter » : accueil, orbe micro (démarrer / pause / reprise), chronomètre,
 * transcription par segments (validés / provisoires), arrêt, puis génération du mail.
 */

import { policyAllowsMicrophone } from '../audio/micCapture';
import { addHistory } from '../security/sessionMemory';
import { loadSettings } from '../security/settings';
import type { DictationSnapshot } from '../transcription/dictation';
import type { AppContext } from '../ui/context';
import { announce, append, autoRows, button, formatDuration, h, icon, replace, switchControl } from '../ui/dom';
import { firstNameFrom, timeGreeting } from '../ui/greeting';
import { openDictationWindow } from './dictationWindow';
import { modelPanel } from './modelPanel';

const SHORTCUT_LABEL: Record<string, string> = { 'ctrl-shift-space': 'Ctrl+Maj+Espace', f8: 'F8', 'alt-shift-d': 'Alt+Maj+D', none: '' };
const WAVE_WEIGHTS = [0.55, 0.85, 1, 0.85, 0.55];

export function dictateView(ctx: AppContext, opts: { dialogMode?: boolean; onSendToParent?: (text: string) => void } = {}): HTMLElement {
  const root = h('div', { class: 'view view-dicter' });
  const session = ctx.dictation;

  const name = firstNameFrom(ctx.host.userDisplayName());
  const hero = h(
    'section',
    { class: 'hero' },
    h('p', { class: 'hero-kicker' }, `${timeGreeting()}${name ? ` ${name}` : ''}`),
    h('h2', { class: 'hero-title' }, opts.dialogMode ? 'Dictée en fenêtre séparée' : 'Que souhaitez-vous dicter ?'),
    h('p', { class: 'hero-sub' }, 'Parlez naturellement. La transcription se fait sur ce poste, puis l’assistant met votre mail en forme.'),
  );
  const modelArea = h('div', { class: 'model-area' });
  const policyNote = h('div');
  const editArea = h('div');
  const transcriptArea = h('div', { class: 'transcript', 'aria-live': 'polite', 'aria-label': 'Transcription' });

  const orbIcon = h('span', { class: 'orb-icon' }, icon('mic'));
  const micButton = h(
    'button',
    { type: 'button', class: 'mic-button orb', 'aria-pressed': 'false', 'aria-label': 'Démarrer la dictée', title: 'Démarrer / mettre en pause la dictée' },
    h('span', { class: 'orb-halo', 'aria-hidden': 'true' }),
    h('span', { class: 'orb-core', 'aria-hidden': 'true' }),
    orbIcon,
  );
  micButton.addEventListener('click', () => void toggle());
  const status = h('p', { class: 'voice-status' });
  const timer = h('span', { class: 'timer', 'aria-hidden': 'true' }, '00:00');
  const bars = WAVE_WEIGHTS.map(() => h('span', { class: 'wave-bar' }));
  const wave = h('div', { class: 'voice-wave', 'aria-hidden': 'true' }, ...bars);
  const controls = h('div', { class: 'voice-controls' });
  const messages = h('div', { class: 'mic-messages' });
  // Panneau de chargement créé une seule fois (conserve le consentement coché et évite les écouteurs en double).
  let asrPanel: HTMLElement | null = null;
  let lastStructure = '';
  let lastTranscript = '';
  let lastStatus = '';

  async function toggle(): Promise<void> {
    const s = session.snapshot();
    if (s.status === 'listening' || s.status === 'starting') session.pause();
    else if (s.status === 'paused') await session.resume();
    else await session.start();
  }

  async function stopAndShow(): Promise<void> {
    await session.stop();
    renderEdit();
    const ta = editArea.querySelector('textarea');
    if (ta) {
      announce('Transcription terminée. Relisez votre dictée puis rédigez le mail.');
      ta.focus();
    }
  }

  function renderEdit(): void {
    const s = session.snapshot();
    const text = session.finalText();
    if (s.status !== 'idle' || !text) {
      replace(editArea);
      return;
    }
    const ta = h('textarea', { class: 'editor', rows: autoRows(text, 4), 'aria-label': 'Transcription originale (modifiable)' });
    ta.value = text;
    let useAi = ctx.draft.useAi && ctx.llm.isReady();
    const generate = () => {
      ctx.draft.source = ta.value;
      ctx.draft.useAi = useAi;
      addHistory({ kind: 'dictation', label: 'Dictée', original: ta.value, result: '' });
      ctx.navigate('rediger');
      ctx.emit('draft');
      document.dispatchEvent(new CustomEvent('aoia:generate'));
    };
    replace(
      editArea,
      h(
        'section',
        { class: 'card edit-card' },
        h('div', { class: 'card-head' }, h('h2', {}, 'Votre dictée'), h('span', { class: 'chip chip-ok' }, icon('check'), 'transcrite sur ce poste')),
        h('p', { class: 'muted small' }, 'Relisez et corrigez si besoin, puis laissez l’assistant rédiger le mail.'),
        ta,
        opts.dialogMode
          ? h('div', { class: 'row' }, button('Envoyer le texte au panneau Outlook', () => opts.onSendToParent?.(ta.value), { kind: 'primary', icon: 'send' }))
          : h(
              'div',
              { class: 'stack' },
              ctx.llm.isReady()
                ? switchControl(`Améliorer avec l’IA locale (${ctx.assistant.aiLabel()})`, useAi, (v) => (useAi = v), { hint: 'Proposition vérifiée automatiquement ; la version sans IA reste disponible.' })
                : h('p', { class: 'muted small' }, 'Rédaction en mode classique (règles, sans IA). Un modèle IA peut être chargé dans « Modèles ».'),
              h('div', { class: 'row' }, button('Rédiger le mail', generate, { kind: 'primary', icon: 'sparkles', id: 'btn-generate', size: 'lg' })),
            ),
      ),
    );
  }

  function renderTranscript(s: DictationSnapshot): void {
    const items: Node[] = [];
    for (const seg of s.segments) {
      if (seg.status === 'final') items.push(h('span', { class: 'seg final' }, `${seg.text} `));
      else if (seg.status === 'pending') items.push(h('span', { class: 'seg pending' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), ' transcription… '));
      else items.push(h('span', { class: 'seg error' }, '[segment non transcrit] '));
    }
    if (s.partial) items.push(h('span', { class: 'seg partial', title: 'Transcription provisoire du segment en cours' }, `${s.partial} `));
    if (s.status === 'listening' && s.speaking && !s.partial) items.push(h('span', { class: 'seg listening' }, 'parole détectée…'));
    if (!items.length) {
      items.push(
        h(
          'span',
          { class: 'placeholder' },
          s.status === 'listening'
            ? 'Parlez : le texte apparaît après chaque courte pause.'
            : 'Votre texte apparaîtra ici. Exemple fictif : « Bonjour Docteur Martin, je vous confirme le staff de jeudi à 14 h 30. »',
        ),
      );
    }
    const key = JSON.stringify([s.segments, s.partial, s.status === 'listening' && s.speaking, s.status === 'listening']);
    if (key === lastTranscript) return; // pas de réannonce inutile pour les lecteurs d'écran
    lastTranscript = key;
    replace(transcriptArea, ...items);
  }

  function statusText(s: DictationSnapshot, ready: boolean): string {
    switch (s.status) {
      case 'idle':
        return ready ? (s.segments.length ? 'Dictée terminée' : 'Touchez l’orbe pour commencer') : 'Chargez d’abord un modèle de transcription (ci-dessus)';
      case 'starting':
        return 'Ouverture du micro…';
      case 'listening':
        return 'Je vous écoute…';
      case 'paused':
        return 'En pause — micro coupé';
      case 'finishing':
        return 'Finalisation de la transcription…';
      default:
        return 'Problème de micro';
    }
  }

  function render(): void {
    const s = session.snapshot();
    const ready = ctx.asr.isReady();
    // Mises à jour légères à chaque tic (250 ms) : chronomètre et niveau, sans recréer d'éléments.
    timer.textContent = formatDuration(s.elapsedMs);
    // Échelle logarithmique : -60 dB → 0, 0 dB → 1.
    const db = s.level > 0 ? 20 * Math.log10(s.level) : -60;
    const level = s.status === 'listening' ? Math.max(0, Math.min(1, (db + 60) / 60)) : 0;
    micButton.style.setProperty('--level', level.toFixed(2));
    bars.forEach((b, i) => (b.style.transform = `scaleY(${(0.18 + level * WAVE_WEIGHTS[i] * 0.82).toFixed(2)})`));
    renderTranscript(s);

    // Reconstruction de la structure uniquement si l'état change (évite la perte du focus clavier).
    const structure = JSON.stringify([s.status, ready, s.segments.length > 0, s.error, s.notice, ctx.whisper.supportsPartial()]);
    if (structure === lastStructure) return;
    lastStructure = structure;

    if (ready) replace(modelArea);
    else {
      asrPanel ??= modelPanel(ctx, 'asr', { compact: true });
      if (!modelArea.contains(asrPanel)) replace(modelArea, asrPanel);
    }
    const listening = s.status === 'listening';
    hero.classList.toggle('compact', s.status !== 'idle' || s.segments.length > 0);
    root.dataset.state = s.status;
    micButton.classList.toggle('active', listening);
    micButton.classList.toggle('paused', s.status === 'paused');
    micButton.classList.toggle('starting', s.status === 'starting');
    micButton.setAttribute('aria-pressed', String(listening));
    micButton.setAttribute('aria-label', listening ? 'Mettre la dictée en pause' : s.status === 'paused' ? 'Reprendre la dictée' : s.status === 'starting' ? 'Annuler l’ouverture du micro' : 'Démarrer la dictée');
    micButton.disabled = !ready || s.status === 'finishing';
    replace(orbIcon, icon(listening ? 'pause' : 'mic', { filled: listening }));

    const text = statusText(s, ready);
    replace(
      status,
      listening ? h('span', { class: 'rec-dot', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'voice-status-text' }, text),
      s.status === 'listening' || s.status === 'paused' ? timer : null,
      listening ? h('span', { class: 'voice-sub' }, ctx.whisper.supportsPartial() ? 'Texte provisoire affiché pendant la parole.' : 'Le texte apparaît après chaque pause.') : null,
    );
    if (text !== lastStatus) {
      lastStatus = text;
      if (s.status !== 'idle' || s.segments.length) announce(text);
    }
    replace(
      controls,
      listening ? button('Pause', () => session.pause(), { icon: 'pause', class: 'btn-round' }) : null,
      s.status === 'starting' ? button('Annuler', () => session.pause(), { icon: 'x', kind: 'ghost', class: 'btn-round' }) : null,
      s.status === 'paused' ? button('Reprendre', () => void session.resume(), { icon: 'play', kind: 'primary', class: 'btn-round' }) : null,
      listening || s.status === 'paused' ? button('Terminer', () => void stopAndShow(), { icon: 'check', kind: 'accent', id: 'btn-stop', class: 'btn-round' }) : null,
      s.segments.length && !listening && s.status !== 'paused' && s.status !== 'starting'
        ? button(
            'Recommencer',
            () => {
              session.reset();
              renderEdit();
            },
            { icon: 'reset', kind: 'ghost', class: 'btn-round' },
          )
        : null,
    );
    replace(
      messages,
      s.error != null
        ? h(
            'div',
            { class: 'alert alert-error', role: 'alert' },
            icon('warn'),
            h(
              'div',
              {},
              s.error.message,
              !opts.dialogMode && (s.error.kind === 'policy' || s.error.kind === 'denied')
                ? h('div', { class: 'row' }, button('Ouvrir la dictée dans une fenêtre séparée', () => openDictationWindow(ctx), { icon: 'external', size: 'sm' }))
                : null,
            ),
          )
        : s.notice
          ? h('div', { class: 'alert alert-warn' }, icon('info'), h('div', {}, s.notice))
          : null,
    );
    if (s.status === 'idle') renderEdit();
  }

  // Note sur la politique du cadre : affichée avant même toute tentative.
  if (!opts.dialogMode && window.self !== window.top && policyAllowsMicrophone() === false) {
    replace(
      policyNote,
      h(
        'div',
        { class: 'alert alert-warn' },
        icon('info'),
        h(
          'div',
          {},
          'Le panneau Outlook ne semble pas autorisé à utiliser le micro. ',
          h('div', { class: 'row' }, button('Ouvrir la dictée dans une fenêtre séparée', () => openDictationWindow(ctx), { icon: 'external', size: 'sm' })),
        ),
      ),
    );
  }

  const shortcutLabel = SHORTCUT_LABEL[loadSettings().shortcut];
  const suggestions = opts.dialogMode
    ? null
    : h(
        'div',
        { class: 'quick-links', role: 'group', 'aria-label': 'Autres actions' },
        button('Écrire au clavier', () => ctx.navigate('rediger'), { kind: 'ghost', icon: 'keyboard', size: 'sm', class: 'chip-btn' }),
        button('Répondre à un message', () => ctx.navigate('repondre'), { kind: 'ghost', icon: 'reply', size: 'sm', class: 'chip-btn' }),
        button('Retrouver un mail', () => ctx.navigate('rechercher'), { kind: 'ghost', icon: 'search', size: 'sm', class: 'chip-btn' }),
      );

  append(root, [
    hero,
    policyNote,
    modelArea,
    h(
      'section',
      { class: 'voice', 'aria-label': 'Micro' },
      h('div', { class: 'orb-wrap' }, micButton),
      status,
      wave,
      controls,
      messages,
      shortcutLabel ? h('p', { class: 'voice-hint' }, h('kbd', {}, shortcutLabel), ' démarrer / pause · ', h('kbd', {}, 'Échap'), ' couper le micro') : null,
    ),
    h('section', { class: 'card transcript-card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Transcription'), h('span', { class: 'chip' }, icon('lock'), 'locale')), transcriptArea),
    editArea,
    suggestions,
  ]);
  session.onChange(render);
  ctx.on('models', render);
  render();
  return root;
}
