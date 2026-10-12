/**
 * Onglet « Dicter » : micro, chronomètre, transcription par segments (validés / provisoires),
 * pause, reprise, arrêt, réinitialisation, puis génération du mail.
 */

import { policyAllowsMicrophone } from '../audio/micCapture';
import { addHistory } from '../security/sessionMemory';
import { loadSettings } from '../security/settings';
import type { AppContext } from '../ui/context';
import { button, formatDuration, h, icon, replace } from '../ui/dom';
import type { DictationSnapshot } from '../transcription/dictation';
import { modelPanel } from './modelPanel';
import { openDictationWindow } from './dictationWindow';

export function dictateView(ctx: AppContext, opts: { dialogMode?: boolean; onSendToParent?: (text: string) => void } = {}): HTMLElement {
  const root = h('div', { class: 'view view-dicter' });
  const session = ctx.dictation;

  const modelArea = h('div');
  const micArea = h('div', { class: 'mic-area' });
  const transcriptArea = h('div', { class: 'transcript', 'aria-live': 'polite', 'aria-label': 'Transcription' });
  const editArea = h('div');
  const policyNote = h('div');

  const micButton = h('button', { type: 'button', class: 'mic-button', 'aria-pressed': 'false', title: 'Démarrer / arrêter la dictée' }, icon('mic'));
  micButton.addEventListener('click', () => void toggle());
  const status = h('div', { class: 'mic-status' });
  const timer = h('div', { class: 'timer' }, '00:00');
  const meter = h('div', { class: 'meter' }, h('div', { class: 'meter-bar' }));
  const controls = h('div', { class: 'row center' });

  async function toggle(): Promise<void> {
    const s = session.snapshot();
    if (s.status === 'listening') await session.pause();
    else if (s.status === 'paused') await session.resume();
    else await session.start();
  }

  async function stopAndShow(): Promise<void> {
    await session.stop();
    renderEdit();
  }

  function renderEdit(): void {
    const s = session.snapshot();
    const text = session.finalText();
    if (s.status !== 'idle' || !text) {
      replace(editArea);
      return;
    }
    const ta = h('textarea', { class: 'editor', rows: 6, 'aria-label': 'Transcription originale (modifiable)' }) as HTMLTextAreaElement;
    ta.value = text;
    const useAi = h('input', { type: 'checkbox', checked: ctx.draft.useAi && ctx.llm.isReady(), disabled: !ctx.llm.isReady() }) as HTMLInputElement;
    replace(
      editArea,
      h('h3', {}, 'Transcription originale'),
      h('p', { class: 'muted small' }, 'Relisez et corrigez si besoin, puis générez le mail.'),
      ta,
      opts.dialogMode
        ? h(
            'div',
            { class: 'row' },
            button('Envoyer le texte au panneau Outlook', () => opts.onSendToParent?.(ta.value), { kind: 'primary', icon: 'send' }),
          )
        : h(
            'div',
            { class: 'stack' },
            h('label', { class: 'inline' }, useAi, ctx.llm.isReady() ? ` Améliorer avec l’IA locale (${ctx.assistant.aiLabel()})` : ' Amélioration IA : aucun modèle chargé (mode classique)'),
            h(
              'div',
              { class: 'row' },
              button(
                'Générer le mail',
                () => {
                  ctx.draft.source = ta.value;
                  ctx.draft.useAi = useAi.checked;
                  addHistory({ kind: 'dictation', label: 'Dictée', original: ta.value, result: '' });
                  ctx.navigate('rediger');
                  ctx.emit('draft');
                  document.dispatchEvent(new CustomEvent('aoia:generate'));
                },
                { kind: 'primary', icon: 'send', id: 'btn-generate' },
              ),
            ),
          ),
    );
  }

  function renderTranscript(s: DictationSnapshot): void {
    const items: Node[] = [];
    for (const seg of s.segments) {
      if (seg.status === 'final') items.push(h('span', { class: 'seg final' }, `${seg.text} `));
      else if (seg.status === 'pending') items.push(h('span', { class: 'seg pending' }, '… transcription en cours ', h('span', { class: 'spinner' })));
      else items.push(h('span', { class: 'seg error' }, '[segment non transcrit] '));
    }
    if (s.partial) items.push(h('span', { class: 'seg partial', title: 'Transcription provisoire du segment en cours' }, `${s.partial} `));
    if (s.status === 'listening' && s.speaking && !s.partial) items.push(h('span', { class: 'seg listening' }, '🎙 parole détectée…'));
    if (!items.length) {
      items.push(
        h(
          'span',
          { class: 'muted' },
          s.status === 'listening' ? 'Parlez : le texte apparaît après chaque courte pause.' : 'La transcription apparaîtra ici. Exemple fictif : « Bonjour Docteur Martin, je vous confirme le staff de jeudi à 14 h 30. »',
        ),
      );
    }
    replace(transcriptArea, ...items);
  }

  function render(): void {
    const s = session.snapshot();
    const ready = ctx.asr.isReady();
    replace(modelArea, ready ? null : modelPanel(ctx, 'asr', { compact: true }));
    micButton.classList.toggle('active', s.status === 'listening');
    micButton.setAttribute('aria-pressed', String(s.status === 'listening'));
    micButton.disabled = !ready || s.status === 'finishing';
    timer.textContent = formatDuration(s.elapsedMs);
    // Échelle logarithmique : -60 dB → 0 %, 0 dB → 100 %.
    const db = s.level > 0 ? 20 * Math.log10(s.level) : -60;
    (meter.firstChild as HTMLElement).style.width = `${Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100)))}%`;
    const statusText: Record<string, string> = {
      idle: ready ? 'Micro inactif' : 'Chargez un modèle de transcription pour commencer',
      listening: 'Micro ACTIF — écoute en cours',
      paused: 'En pause — micro libéré',
      finishing: 'Fin de la transcription…',
      error: 'Problème de micro',
    };
    replace(
      status,
      s.status === 'listening' ? h('span', { class: 'rec-dot' }) : null,
      statusText[s.status],
      s.status === 'listening' ? h('span', { class: 'muted small block' }, ctx.whisper.supportsPartial() ? 'Texte provisoire affiché pendant la parole.' : 'Transcription par segments, après chaque pause.') : null,
    );
    replace(
      controls,
      s.status === 'listening' ? button('Pause', () => void session.pause(), { icon: 'pause' }) : null,
      s.status === 'paused' ? button('Reprendre', () => void session.resume(), { icon: 'play', kind: 'primary' }) : null,
      s.status === 'listening' || s.status === 'paused' ? button('Arrêter', () => void stopAndShow(), { icon: 'stop', kind: 'danger', id: 'btn-stop' }) : null,
      s.segments.length && s.status !== 'listening'
        ? button(
            'Réinitialiser',
            () => {
              session.reset();
              renderEdit();
            },
            { icon: 'reset', kind: 'ghost' },
          )
        : null,
    );
    renderTranscript(s);
    const errorBox =
      s.error != null
        ? h(
            'div',
            { class: 'alert alert-error', role: 'alert' },
            s.error.message,
            !opts.dialogMode && (s.error.kind === 'policy' || s.error.kind === 'denied')
              ? h('div', { class: 'row' }, button('Ouvrir la dictée dans une fenêtre séparée', () => openDictationWindow(ctx), { icon: 'external' }))
              : null,
          )
        : s.notice
          ? h('div', { class: 'alert alert-warn' }, s.notice)
          : null;
    replace(micArea, h('div', { class: 'mic-row' }, micButton, h('div', { class: 'mic-info' }, status, timer, meter)), controls, errorBox);
    if (s.status === 'idle') renderEdit();
  }

  // Note sur la politique du cadre : affichée avant même toute tentative.
  if (!opts.dialogMode && window.self !== window.top && policyAllowsMicrophone() === false) {
    replace(
      policyNote,
      h(
        'div',
        { class: 'alert alert-warn' },
        'Le panneau Outlook ne semble pas autorisé à utiliser le micro. ',
        button('Ouvrir la dictée dans une fenêtre séparée', () => openDictationWindow(ctx), { icon: 'external' }),
      ),
    );
  }

  const shortcut = loadSettings().shortcut;
  const shortcutLabel = { 'ctrl-shift-space': 'Ctrl+Maj+Espace', f8: 'F8', 'alt-shift-d': 'Alt+Maj+D', none: '' }[shortcut];

  root.append(
    policyNote,
    modelArea,
    h('section', { class: 'card' }, micArea, shortcutLabel ? h('p', { class: 'muted small' }, `Raccourci (panneau actif) : ${shortcutLabel} · Échap : arrêt immédiat du micro`) : null),
    h('section', { class: 'card' }, h('h3', {}, 'Transcription'), transcriptArea),
    editArea,
  );
  session.onChange(render);
  ctx.on('models', render);
  render();
  return root;
}
