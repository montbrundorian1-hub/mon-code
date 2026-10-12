/**
 * Sélection et chargement guidés d'un modèle (taille annoncée, consentement, progression,
 * annulation, repli vers un modèle plus léger, puis mode classique).
 */

import { formatBytes, lighterThan, recommend, type ModelFamily, type ModelSpec, type ModelVariant } from '../ai/models';
import { HEAVY_MODEL_BYTES } from '../config';
import { loadSettings, updateSettings } from '../security/settings';
import type { AppContext } from '../ui/context';
import { button, h, replace } from '../ui/dom';

export function modelPanel(ctx: AppContext, family: ModelFamily, opts: { compact?: boolean } = {}): HTMLElement {
  const root = h('section', { class: `card model-panel ${opts.compact ? 'compact' : ''}`, 'aria-live': 'polite' });
  const handle = family === 'asr' ? ctx.asr : ctx.llm;
  let selectedId: string | null = null;
  let consent = false;

  const render = () => {
    const caps = ctx.caps;
    const title = family === 'asr' ? 'Transcription vocale locale' : 'Rédaction par IA locale (expérimental)';
    if (!caps) {
      replace(root, h('h2', {}, title), h('p', { class: 'muted' }, 'Analyse des capacités du poste…'));
      return;
    }
    const options = recommend(family, caps);
    const s = handle.state;
    const header = h('h2', {}, title);

    if (s.status === 'ready') {
      replace(
        root,
        header,
        h('p', { class: 'state ok' }, `Prêt : ${s.spec.label} (${s.variant.device === 'webgpu' ? 'carte graphique, WebGPU' : 'processeur, WASM'})`),
        s.spec.caution ? h('p', { class: 'caution' }, s.spec.caution) : null,
        opts.compact ? null : button('Décharger (libérer la mémoire)', () => handle.cancel(), { kind: 'ghost' }),
      );
      return;
    }
    if (s.status === 'downloading' || s.status === 'loading') {
      const pct = s.status === 'downloading' && s.total ? Math.min(100, Math.round((s.loaded / s.total) * 100)) : 100;
      replace(
        root,
        header,
        h('p', { class: 'state' }, s.status === 'downloading' ? `Téléchargement de ${s.spec.label}…` : 'Initialisation du modèle (compilation, mise en mémoire)…'),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('div', { class: 'bar', style: `width:${pct}%` })),
        h('p', { class: 'muted small' }, s.status === 'downloading' ? `${formatBytes(s.loaded)} / ${formatBytes(s.total)}` : 'Cela peut prendre jusqu’à une minute sur un poste modeste.'),
        button('Annuler', () => handle.cancel(), { kind: 'danger', icon: 'x' }),
      );
      return;
    }

    if (!options.length) {
      replace(
        root,
        header,
        h('p', { class: 'state warn' }, 'Aucun modèle compatible avec ce poste (WebAssembly SIMD ou WebGPU requis).'),
        h('p', {}, family === 'asr' ? 'Saisissez le texte au clavier dans l’onglet Rédiger.' : 'Le mode classique (sans IA) reste disponible.'),
      );
      return;
    }

    const settings = loadSettings();
    const preferred = family === 'asr' ? settings.asrModel : settings.llmModel;
    if (!selectedId || !options.some((o) => o.spec.id === selectedId)) {
      selectedId = options.find((o) => o.spec.id === preferred)?.spec.id ?? options[0].spec.id;
    }
    const chosen = options.find((o) => o.spec.id === selectedId)!;

    const list = h(
      'div',
      { class: 'model-options', role: 'radiogroup' },
      ...options.map((o, i) =>
        h(
          'label',
          { class: `model-option ${o.spec.id === selectedId ? 'selected' : ''}` },
          h('input', {
            type: 'radio',
            name: `model-${family}`,
            checked: o.spec.id === selectedId,
            onchange: () => {
              selectedId = o.spec.id;
              consent = false;
              render();
            },
          }),
          h(
            'span',
            { class: 'model-text' },
            h('strong', {}, o.spec.label),
            i === 0 ? h('span', { class: 'chip chip-ok' }, 'recommandé') : null,
            h('span', { class: 'chip' }, `${formatBytes(o.variant.bytes)} · ${o.variant.device === 'webgpu' ? 'WebGPU' : 'processeur'}`),
            opts.compact ? null : h('span', { class: 'small muted block' }, o.spec.quality),
            opts.compact ? null : h('span', { class: 'small muted block' }, `Licence : ${o.spec.license}`),
          ),
        ),
      ),
    );

    const errorBlock =
      s.status === 'error'
        ? errorView(ctx, family, s.spec, s.variant, s.message, s.kind, (spec, variant) => start(spec, variant))
        : s.status === 'cancelled'
          ? h('p', { class: 'state warn' }, 'Téléchargement annulé.')
          : null;

    const heavy = chosen.variant.bytes >= HEAVY_MODEL_BYTES;
    const consentBox = h(
      'label',
      { class: 'consent' },
      h('input', {
        type: 'checkbox',
        checked: consent,
        onchange: (e: Event) => {
          consent = (e.target as HTMLInputElement).checked;
          loadBtn.disabled = !consent;
        },
      }),
      h(
        'span',
        {},
        `J’accepte de télécharger ${formatBytes(chosen.variant.bytes)} de poids de modèle depuis ${settings.modelSource === 'self-hosted' ? 'le site de l’application' : 'huggingface.co'}. `,
        'Aucune donnée n’est envoyée : seuls les fichiers du modèle sont reçus.',
        heavy ? h('strong', { class: 'block' }, ' Téléchargement volumineux : évitez-le sur une connexion limitée ou un poste partagé.') : null,
      ),
    );
    const loadBtn = button(`Télécharger et charger (${formatBytes(chosen.variant.bytes)})`, () => start(chosen.spec, chosen.variant), {
      kind: 'primary',
      disabled: !consent,
    });

    replace(
      root,
      header,
      family === 'llm'
        ? h('p', { class: 'muted small' }, 'Le mode classique (règles, sans IA) fonctionne sans téléchargement. L’IA locale ne fait que polir un texte déjà structuré ; ses propositions sont vérifiées automatiquement.')
        : h('p', { class: 'muted small' }, 'La transcription est réalisée sur ce poste. Aucun audio n’est envoyé ni conservé.'),
      errorBlock,
      list,
      chosen.spec.caution ? h('p', { class: 'caution' }, chosen.spec.caution) : null,
      consentBox,
      loadBtn,
    );
  };

  const start = (spec: ModelSpec, variant: ModelVariant) => {
    if (family === 'asr') updateSettings({ asrModel: spec.id });
    else updateSettings({ llmModel: spec.id });
    selectedId = spec.id;
    consent = false;
    void handle.load(spec, variant, true);
  };

  render();
  ctx.on('models', render);
  return root;
}

function errorView(
  ctx: AppContext,
  family: ModelFamily,
  spec: ModelSpec,
  _variant: ModelVariant,
  message: string,
  kind: 'memory' | 'network' | 'other',
  retry: (spec: ModelSpec, variant: ModelVariant) => void,
): HTMLElement {
  const lighter = ctx.caps ? lighterThan(spec.id, family, ctx.caps) : null;
  const explanation =
    kind === 'memory'
      ? 'Mémoire insuffisante : ce modèle est trop lourd pour ce poste.'
      : kind === 'network'
        ? 'Téléchargement impossible : le réseau (proxy ou filtrage du CHU) bloque peut-être huggingface.co.'
        : 'Le modèle n’a pas pu être chargé.';
  return h(
    'div',
    { class: 'alert alert-error' },
    h('strong', {}, `Échec : ${spec.label}. `),
    explanation,
    h('div', { class: 'small muted' }, `Détail technique : ${message}`),
    lighter
      ? h(
          'div',
          { class: 'row' },
          button(`Essayer un modèle plus léger : ${lighter.spec.label} (${formatBytes(lighter.variant.bytes)})`, () => retry(lighter.spec, lighter.variant), { kind: 'primary' }),
        )
      : h('p', {}, family === 'asr' ? 'Aucun modèle plus léger : saisissez le texte au clavier (onglet Rédiger).' : 'Aucun modèle plus léger : le mode classique (sans IA) reste pleinement utilisable.'),
  );
}
