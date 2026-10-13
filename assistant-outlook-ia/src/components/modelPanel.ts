/**
 * Sélection et chargement guidés d'un modèle, en langage clair : taille annoncée, consentement,
 * progression, annulation, repli vers un modèle plus léger, puis mode classique.
 */

import { formatBytes, lighterThan, recommend, type ModelFamily, type ModelSpec, type ModelVariant } from '../ai/models';
import { HEAVY_MODEL_BYTES } from '../config';
import { loadSettings, updateSettings } from '../security/settings';
import type { AppContext } from '../ui/context';
import { announce, button, h, icon, replace } from '../ui/dom';

const COPY: Record<ModelFamily, { title: string; sub: string; icon: 'mic' | 'sparkles' }> = {
  asr: { title: 'Dictée vocale', sub: 'Reconnaissance de la parole sur ce poste : aucun audio n’est envoyé ni conservé.', icon: 'mic' },
  llm: {
    title: 'Rédaction par IA (optionnel)',
    sub: 'Le mode classique fonctionne sans téléchargement. L’IA locale peaufine un texte déjà structuré ; ses propositions sont vérifiées automatiquement.',
    icon: 'sparkles',
  },
};

const deviceLabel = (v: ModelVariant) => (v.device === 'webgpu' ? 'carte graphique' : 'processeur');

export function modelPanel(ctx: AppContext, family: ModelFamily, opts: { compact?: boolean } = {}): HTMLElement {
  const root = h('section', { class: `card model-panel${opts.compact ? ' compact' : ''}`, 'aria-label': COPY[family].title });
  const handle = family === 'asr' ? ctx.asr : ctx.llm;
  let selectedId: string | null = null;
  let consent = false;
  let lastStatus = '';
  /** Mode compact : les modèles autres que le recommandé sont repliés (« Autres modèles »). */
  let othersOpen = false;

  const head = (pill: HTMLElement | null) =>
    h(
      'div',
      { class: 'panel-head' },
      h('span', { class: 'panel-icon', 'aria-hidden': 'true' }, icon(COPY[family].icon)),
      h(
        'div',
        { class: 'panel-title' },
        h('div', { class: 'panel-title-row' }, h('h2', {}, COPY[family].title), pill),
        h('p', {}, opts.compact && family === 'asr' ? 'Une seule étape avant de dicter : activer la reconnaissance vocale locale.' : COPY[family].sub),
      ),
    );

  const render = () => {
    const caps = ctx.caps;
    const s = handle.state;
    if (s.status !== lastStatus) {
      lastStatus = s.status;
      if (s.status === 'ready') announce(`${COPY[family].title} : modèle prêt.`);
      else if (s.status === 'error') announce(`${COPY[family].title} : échec du chargement.`);
      else if (s.status === 'downloading') announce(`${COPY[family].title} : téléchargement en cours.`);
    }
    if (!caps) {
      replace(root, head(null), h('div', { class: 'skeleton' }, h('span'), h('span'), h('span')), h('p', { class: 'muted small' }, 'Analyse des capacités du poste…'));
      return;
    }
    const options = recommend(family, caps);

    if (s.status === 'ready') {
      replace(
        root,
        head(h('span', { class: 'chip chip-ok' }, icon('check'), 'prêt')),
        h('p', { class: 'state ok' }, icon('check-circle'), `${s.spec.label} — sur le ${deviceLabel(s.variant)}`),
        s.spec.caution ? h('p', { class: 'caution' }, icon('info'), h('span', {}, s.spec.caution)) : null,
        opts.compact ? null : h('div', { class: 'row' }, button('Décharger (libérer la mémoire)', () => handle.cancel(), { kind: 'ghost', size: 'sm' })),
      );
      return;
    }
    if (s.status === 'downloading' || s.status === 'loading') {
      const pct = s.status === 'downloading' && s.total ? Math.min(100, Math.round((s.loaded / s.total) * 100)) : 100;
      replace(
        root,
        head(h('span', { class: 'chip chip-accent' }, s.status === 'downloading' ? `${pct} %` : 'préparation')),
        h('p', { class: 'state' }, s.status === 'downloading' ? `Téléchargement de ${s.spec.label}…` : 'Mise en mémoire et préparation du modèle…'),
        h(
          'div',
          { class: `progress${s.status === 'loading' ? ' indeterminate' : ''}`, role: 'progressbar', 'aria-label': `Chargement de ${s.spec.label}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
          h('div', { class: 'bar', style: `width:${pct}%` }),
        ),
        h(
          'p',
          { class: 'muted small' },
          s.status === 'downloading' ? `${formatBytes(s.loaded)} sur ${formatBytes(s.total)} — vous pouvez continuer à utiliser l’assistant.` : 'Cela peut prendre jusqu’à une minute sur un poste modeste.',
        ),
        h('div', { class: 'row' }, button('Annuler', () => handle.cancel(), { kind: 'ghost', icon: 'x', size: 'sm' })),
      );
      return;
    }

    if (!options.length) {
      replace(
        root,
        head(h('span', { class: 'chip chip-warn' }, 'indisponible')),
        h('p', { class: 'state warn' }, icon('warn'), 'Aucun modèle compatible avec ce poste (WebAssembly SIMD ou WebGPU requis).'),
        h('p', {}, family === 'asr' ? 'Saisissez le texte au clavier dans l’onglet « Rédiger ».' : 'Le mode classique (sans IA) reste disponible.'),
      );
      return;
    }

    const settings = loadSettings();
    const preferred = family === 'asr' ? settings.asrModel : settings.llmModel;
    if (!selectedId || !options.some((o) => o.spec.id === selectedId)) {
      selectedId = options.find((o) => o.spec.id === preferred)?.spec.id ?? options[0].spec.id;
    }
    const chosen = options.find((o) => o.spec.id === selectedId)!;

    const optionCard = (o: (typeof options)[number], i: number) =>
        h(
          'label',
          { class: `model-option${o.spec.id === selectedId ? ' selected' : ''}` },
          h('input', {
            type: 'radio',
            name: `model-${family}`,
            checked: o.spec.id === selectedId,
            onchange: () => {
              selectedId = o.spec.id;
              consent = false;
              render();
              root.querySelector<HTMLInputElement>(`input[name="model-${family}"]:checked`)?.focus();
            },
          }),
          h(
            'span',
            { class: 'model-text' },
            h('span', { class: 'model-name' }, h('strong', {}, o.spec.label), i === 0 ? h('span', { class: 'chip chip-ok' }, 'recommandé') : null),
            h('span', { class: 'model-meta' }, `${formatBytes(o.variant.bytes)} · ${deviceLabel(o.variant)}`),
            opts.compact ? null : h('span', { class: 'model-quality' }, o.spec.quality),
            opts.compact ? null : h('span', { class: 'model-license' }, `Licence : ${o.spec.license}`),
          ),
        );
    let list: HTMLElement;
    if (opts.compact && options.length > 1) {
      if (selectedId !== options[0].spec.id) othersOpen = true;
      const more = h(
        'details',
        { class: 'more-models', open: othersOpen },
        h('summary', {}, `Autres modèles (${options.length - 1})`),
        h('div', { class: 'model-options' }, ...options.slice(1).map((o, i) => optionCard(o, i + 1))),
      );
      more.addEventListener('toggle', () => (othersOpen = more.open));
      list = h('div', { class: 'model-options', role: 'radiogroup', 'aria-label': 'Modèles disponibles' }, optionCard(options[0], 0), more);
    } else {
      list = h('div', { class: 'model-options', role: 'radiogroup', 'aria-label': 'Modèles disponibles' }, ...options.map((o, i) => optionCard(o, i)));
    }

    const errorBlock =
      s.status === 'error'
        ? errorView(ctx, family, s.spec, s.message, s.kind, (spec, variant) => start(spec, variant))
        : s.status === 'cancelled'
          ? h('p', { class: 'state warn' }, icon('info'), 'Téléchargement annulé.')
          : null;

    const heavy = chosen.variant.bytes >= HEAVY_MODEL_BYTES;
    const loadBtn = button(`Télécharger et activer (${formatBytes(chosen.variant.bytes)})`, () => start(chosen.spec, chosen.variant), {
      kind: 'primary',
      icon: 'download',
      disabled: !consent,
    });
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
        `J’accepte de télécharger ${formatBytes(chosen.variant.bytes)} de fichiers de modèle depuis ${settings.modelSource === 'self-hosted' ? 'le site de l’application' : 'huggingface.co'}. `,
        'Aucune donnée n’est envoyée : seuls les fichiers du modèle sont reçus.',
        heavy ? h('strong', { class: 'block' }, 'Téléchargement volumineux : évitez-le sur une connexion limitée ou un poste partagé.') : null,
      ),
    );

    replace(
      root,
      head(h('span', { class: 'chip' }, family === 'asr' ? 'à activer' : 'facultatif')),
      errorBlock,
      list,
      chosen.spec.caution ? h('p', { class: 'caution' }, icon('info'), h('span', {}, chosen.spec.caution)) : null,
      consentBox,
      h('div', { class: 'row' }, loadBtn),
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
  message: string,
  kind: 'memory' | 'network' | 'crash' | 'other',
  retry: (spec: ModelSpec, variant: ModelVariant) => void,
): HTMLElement {
  const lighter = ctx.caps ? lighterThan(spec.id, family, ctx.caps) : null;
  const explanation =
    kind === 'memory'
      ? 'Mémoire insuffisante : ce modèle est trop lourd pour ce poste.'
      : kind === 'network'
        ? /trop de demandes/.test(message)
          ? 'huggingface.co limite temporairement les téléchargements (trop de demandes). Réessayez dans quelques minutes.'
          : /momentanément indisponible/.test(message)
            ? 'Le serveur des modèles est momentanément indisponible. Réessayez plus tard.'
            : 'Téléchargement impossible : le réseau (proxy ou filtrage de l’établissement) bloque peut-être huggingface.co.'
        : kind === 'crash'
          ? 'Le moteur de calcul s’est arrêté de façon inattendue (souvent par manque de mémoire).'
          : 'Le modèle n’a pas pu être chargé.';
  return h(
    'div',
    { class: 'alert alert-error', role: 'alert' },
    icon('warn'),
    h(
      'div',
      {},
      h('strong', {}, `Échec : ${spec.label}. `),
      explanation,
      h('details', { class: 'tech' }, h('summary', {}, 'Détail technique'), h('p', { class: 'small' }, message)),
      lighter
        ? h(
            'div',
            { class: 'row' },
            button(`Essayer plus léger : ${lighter.spec.label} (${formatBytes(lighter.variant.bytes)})`, () => retry(lighter.spec, lighter.variant), { kind: 'accent', size: 'sm' }),
          )
        : h('p', {}, family === 'asr' ? 'Aucun modèle plus léger : saisissez le texte au clavier (onglet « Rédiger »).' : 'Aucun modèle plus léger : le mode classique (sans IA) reste pleinement utilisable.'),
    ),
  );
}
