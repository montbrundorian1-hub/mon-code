/**
 * Onglet « Modèles » : modèles locaux (dictée, rédaction), préférences, détails techniques du poste.
 */

import { hardwareTier } from '../ai/models';
import { MODEL_CACHE_NAME } from '../config';
import { loadSettings, updateSettings, type ModelSource, type ShortcutId } from '../security/settings';
import type { AppContext } from '../ui/context';
import { button, h, icon, replace, switchControl, toast } from '../ui/dom';
import { modelPanel } from './modelPanel';

export async function clearModelCache(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    return await caches.delete(MODEL_CACHE_NAME);
  } catch {
    return false;
  }
}

const TIER_LABEL = { gpu: 'Carte graphique disponible', 'cpu-confort': 'Processeur confortable', 'cpu-modeste': 'Processeur modeste', insuffisant: 'Insuffisant pour l’IA locale' } as const;

export function settingsView(ctx: AppContext): HTMLElement {
  const root = h('div', { class: 'view view-modeles' });
  const hw = h('div', { class: 'hw' });
  const cacheInfo = h('p', { class: 'muted small' });

  const renderHw = () => {
    const c = ctx.caps;
    if (!c) return replace(hw, h('p', { class: 'muted' }, 'Analyse du poste…'));
    const tier = hardwareTier(c);
    replace(
      hw,
      h('p', { class: 'hw-tier' }, icon('cpu'), h('strong', {}, TIER_LABEL[tier])),
      h(
        'ul',
        { class: 'kv' },
        h('li', {}, h('span', {}, 'Carte graphique (WebGPU)'), h('strong', {}, c.webgpu ? `oui${c.shaderF16 ? ' (f16)' : ''}` : 'non')),
        h('li', {}, h('span', {}, 'WebAssembly SIMD'), h('strong', {}, c.wasmSimd ? 'oui' : 'non')),
        h('li', {}, h('span', {}, 'Mémoire déclarée'), h('strong', {}, c.memoryGB ? `≥ ${c.memoryGB} Go` : 'inconnue')),
        h('li', {}, h('span', {}, 'Cœurs logiques'), h('strong', {}, c.cores ? String(c.cores) : 'inconnu')),
        c.gpuInfo ? h('li', {}, h('span', {}, 'Adaptateur graphique'), h('strong', {}, c.gpuInfo)) : null,
      ),
      h('p', { class: 'muted small' }, 'Les recommandations de modèles en découlent. La mémoire réelle n’est pas mesurable de façon fiable par une page web.'),
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
  const sourceSel = h(
    'select',
    {
      id: 'set-source',
      onchange: (e: Event) => updateSettings({ modelSource: (e.target as HTMLSelectElement).value as ModelSource }),
    },
    h('option', { value: 'huggingface', selected: s.modelSource === 'huggingface' }, 'Hugging Face (huggingface.co)'),
    h('option', { value: 'self-hosted', selected: s.modelSource === 'self-hosted' }, 'Auto-hébergés (dossier models/ du site)'),
  );
  const shortcutSel = h(
    'select',
    {
      id: 'set-shortcut',
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

  root.append(
    h(
      'section',
      { class: 'hero compact' },
      h('h2', { class: 'hero-title' }, 'Modèles et réglages'),
      h('p', { class: 'hero-sub' }, 'Tout fonctionne sur ce poste. Activez seulement ce dont vous avez besoin.'),
    ),
    modelPanel(ctx, 'asr'),
    modelPanel(ctx, 'llm'),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Préférences')),
      h(
        'div',
        { class: 'settings-list' },
        switchControl(
          'Ponctuation dictée',
          s.dictatedPunctuation,
          (v) => {
            updateSettings({ dictatedPunctuation: v });
            toast(v ? 'Les mots « virgule », « à la ligne »… deviendront de la ponctuation.' : 'Les mots « virgule », « à la ligne »… seront conservés tels quels.', 'info');
          },
          { hint: '« virgule », « point à la ligne », « nouveau paragraphe »… deviennent de la ponctuation.' },
        ),
        switchControl(
          'Garder les modèles en cache',
          s.cacheModels,
          (v) => {
            updateSettings({ cacheModels: v });
            toast('Préférence enregistrée. Elle s’applique au prochain chargement de modèle.', 'info');
          },
          { hint: 'Évite de retélécharger à chaque session. Déconseillé sur un poste partagé. Ne contient jamais de dictée ni de mail.' },
        ),
        h(
          'div',
          { class: 'cache-row' },
          cacheInfo,
          button(
            'Vider le cache',
            async () => {
              const ok = await clearModelCache();
              toast(ok ? 'Cache des modèles vidé.' : 'Aucun cache à vider.', 'info');
              void refreshCache();
            },
            { kind: 'ghost', icon: 'trash', size: 'sm' },
          ),
        ),
        h('div', { class: 'field' }, h('label', { for: 'set-shortcut' }, 'Raccourci du micro'), shortcutSel, h('p', { class: 'field-hint' }, 'Actif quand le panneau a le focus. Échap coupe toujours le micro.')),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'set-source' }, 'Source des modèles'),
          sourceSel,
          h('p', { class: 'field-hint' }, 'Auto-hébergé : déposez les fichiers des modèles dans le dossier models/ du site (voir docs/DEPLOYMENT.md). Aucun accès à huggingface.co n’est alors nécessaire.'),
        ),
      ),
    ),
    h('details', { class: 'card disclosure' }, h('summary', {}, icon('cpu'), h('span', {}, 'Détails techniques du poste')), hw),
  );
  renderHw();
  void refreshCache();
  ctx.on('models', () => {
    renderHw();
    void refreshCache();
  });
  return root;
}
