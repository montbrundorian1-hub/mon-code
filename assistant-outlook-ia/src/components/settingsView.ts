/**
 * Onglet « Modèles » : profil matériel, chargement des modèles, cache, source, raccourci.
 */

import { hardwareTier } from '../ai/models';
import { MODEL_CACHE_NAME } from '../config';
import { loadSettings, updateSettings, type ModelSource, type ShortcutId } from '../security/settings';
import type { AppContext } from '../ui/context';
import { button, h, replace, toast } from '../ui/dom';
import { modelPanel } from './modelPanel';

export async function clearModelCache(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    return await caches.delete(MODEL_CACHE_NAME);
  } catch {
    return false;
  }
}

export function settingsView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-modeles' });
  const hw = h('section', { class: 'card' });
  const cacheInfo = h('p', { class: 'muted small' });

  const renderHw = () => {
    const c = ctx.caps;
    if (!c) return replace(hw, h('p', { class: 'muted' }, 'Analyse du poste…'));
    const tier = hardwareTier(c);
    replace(
      hw,
      h('h2', {}, 'Profil du poste'),
      h(
        'ul',
        { class: 'kv' },
        h('li', {}, h('span', {}, 'Carte graphique (WebGPU)'), h('strong', {}, c.webgpu ? `oui${c.shaderF16 ? ' (f16)' : ''}` : 'non')),
        h('li', {}, h('span', {}, 'WebAssembly SIMD'), h('strong', {}, c.wasmSimd ? 'oui' : 'non')),
        h('li', {}, h('span', {}, 'Mémoire déclarée'), h('strong', {}, c.memoryGB ? `≥ ${c.memoryGB} Go` : 'inconnue')),
        h('li', {}, h('span', {}, 'Cœurs logiques'), h('strong', {}, c.cores ? String(c.cores) : 'inconnu')),
        h('li', {}, h('span', {}, 'Profil'), h('strong', {}, { gpu: 'Carte graphique', 'cpu-confort': 'Processeur confortable', 'cpu-modeste': 'Processeur modeste', insuffisant: 'Insuffisant' }[tier])),
      ),
      h('p', { class: 'muted small' }, 'Les recommandations ci-dessous en découlent. La mémoire réelle n’est pas mesurable de façon fiable par une page web.'),
    );
  };

  const refreshCache = async () => {
    try {
      if (typeof caches === 'undefined' || !(await caches.has(MODEL_CACHE_NAME))) {
        cacheInfo.textContent = 'Aucun modèle en cache.';
        return;
      }
      const c = await caches.open(MODEL_CACHE_NAME);
      const keys = await c.keys();
      cacheInfo.textContent = `${keys.length} fichier(s) de modèle en cache (poids de modèles uniquement, aucune donnée utilisateur).`;
    } catch {
      cacheInfo.textContent = 'État du cache inconnu (stockage bloqué ?).';
    }
  };

  const s = loadSettings();
  const cacheBox = h('input', {
    type: 'checkbox',
    checked: s.cacheModels,
    onchange: (e: Event) => {
      updateSettings({ cacheModels: (e.target as HTMLInputElement).checked });
      toast('Préférence enregistrée. Elle s’applique au prochain chargement de modèle.', 'info');
    },
  });
  const sourceSel = h(
    'select',
    {
      'aria-label': 'Source des modèles',
      onchange: (e: Event) => updateSettings({ modelSource: (e.target as HTMLSelectElement).value as ModelSource }),
    },
    h('option', { value: 'huggingface', selected: s.modelSource === 'huggingface' }, 'Hugging Face (huggingface.co)'),
    h('option', { value: 'self-hosted', selected: s.modelSource === 'self-hosted' }, 'Auto-hébergés (dossier models/ du site)'),
  );
  const shortcutSel = h(
    'select',
    {
      'aria-label': 'Raccourci du micro',
      onchange: (e: Event) => updateSettings({ shortcut: (e.target as HTMLSelectElement).value as ShortcutId }),
    },
    ...(
      [
        ['ctrl-shift-space', 'Ctrl + Maj + Espace'],
        ['f8', 'F8'],
        ['alt-shift-d', 'Alt + Maj + D'],
        ['none', 'Aucun'],
      ] as const
    ).map(([v, l]) => h('option', { value: v, selected: s.shortcut === v }, l)),
  );
  const punctBox = h('input', {
    type: 'checkbox',
    checked: s.dictatedPunctuation,
    onchange: (e: Event) => updateSettings({ dictatedPunctuation: (e.target as HTMLInputElement).checked }),
  });

  root.append(
    hw,
    modelPanel(ctx, 'asr'),
    modelPanel(ctx, 'llm'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Cache et source des modèles'),
      h('label', { class: 'inline' }, cacheBox, ' Conserver les modèles téléchargés dans le cache du navigateur'),
      h('p', { class: 'muted small' }, 'Évite de retélécharger à chaque session. Déconseillé sur un poste partagé : le cache du navigateur n’est pas un stockage privé garanti. Il ne contient jamais de dictée ni de mail.'),
      cacheInfo,
      button(
        'Vider le cache des modèles',
        async () => {
          const ok = await clearModelCache();
          toast(ok ? 'Cache des modèles vidé.' : 'Aucun cache à vider.', 'info');
          void refreshCache();
        },
        { kind: 'ghost' },
      ),
      h('label', { class: 'block' }, 'Source : ', sourceSel),
      h('p', { class: 'muted small' }, 'Auto-hébergé : déposez les fichiers des modèles dans le dossier models/ du site (voir docs/DEPLOYMENT.md). Aucun accès à huggingface.co n’est alors nécessaire.'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Dictée'),
      h('label', { class: 'block' }, 'Raccourci micro (actif quand le panneau a le focus) : ', shortcutSel),
      h('label', { class: 'inline' }, punctBox, ' Interpréter « virgule », « point à la ligne », « nouveau paragraphe »… comme de la ponctuation'),
    ),
  );
  renderHw();
  void refreshCache();
  ctx.on('models', () => {
    renderHw();
    void refreshCache();
  });
  return root;
}
