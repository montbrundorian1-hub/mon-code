/**
 * Onglet « Aide » : prise en main, confidentialité, raccourcis, limites connues, historique de session.
 */

import { APP_VERSION } from '../config';
import { clearHistory, getHistory, onHistoryChange } from '../security/sessionMemory';
import { button, h, icon, replace, type IconName } from '../ui/dom';

function feature(ic: IconName, text: string, cls = ''): HTMLElement {
  return h('li', { class: cls }, h('span', { class: 'feature-icon', 'aria-hidden': 'true' }, icon(ic)), h('span', {}, text));
}

export function helpView(): HTMLElement {
  const hist = h('div');
  const renderHist = () => {
    const items = getHistory();
    replace(
      hist,
      h('p', { class: 'muted small' }, `${items.length} élément(s) en mémoire vive — effacé(s) à la fermeture du panneau ou après 30 min d’inactivité.`),
      items.length ? h('ul', { class: 'history' }, ...items.slice(0, 10).map((e) => h('li', {}, h('span', { class: 'history-time' }, new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })), e.label))) : null,
      h('div', { class: 'row' }, button('Effacer maintenant', () => clearHistory(), { kind: 'ghost', icon: 'trash', size: 'sm' })),
    );
  };
  onHistoryChange(renderHist);
  renderHist();
  return h(
    'div',
    { class: 'view view-aide' },
    h('section', { class: 'hero compact' }, h('h2', { class: 'hero-title' }, 'Aide et confidentialité'), h('p', { class: 'hero-sub' }, 'L’essentiel pour utiliser l’assistant sereinement.')),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Comment ça marche')),
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, h('strong', {}, 'Dictez ou écrivez'), h('span', {}, 'votre message, même en style télégraphique.')),
        h('li', {}, h('strong', {}, 'Relisez'), h('span', {}, 'la proposition et les vérifications (dates, doses, noms).')),
        h('li', {}, h('strong', {}, 'Insérez dans Outlook'), h('span', {}, 'puis envoyez vous-même : rien ne part automatiquement.')),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Vos données restent ici')),
      h(
        'ul',
        { class: 'feature-list' },
        feature('cpu', 'La transcription et la rédaction s’exécutent sur ce poste. Aucun texte ni audio n’est envoyé à un service externe (garde réseau actif).'),
        feature('download', 'Seuls les fichiers des modèles sont téléchargés, après votre accord explicite.'),
        feature('lock', 'Aucune dictée, aucun mail, aucun audio n’est enregistré durablement. L’historique reste en mémoire et s’efface à la fermeture.'),
        feature('mail', 'Aucun mail n’est envoyé automatiquement : vous relisez et envoyez vous-même dans Outlook.'),
        feature(
          'shield',
          'Une IA locale n’est pas, à elle seule, une autorisation de traiter des données de patients. Utilisez uniquement des données fictives tant que votre établissement (DPO, RSSI) n’a pas validé l’usage.',
          'caution-item',
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Raccourcis')),
      h(
        'ul',
        { class: 'shortcuts' },
        h('li', {}, h('span', {}, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Maj'), '+', h('kbd', {}, 'Espace')), h('span', {}, 'démarrer / mettre en pause la dictée (configurable)')),
        h('li', {}, h('span', {}, h('kbd', {}, 'Échap')), h('span', {}, 'couper immédiatement le micro')),
        h('li', {}, h('span', {}, h('kbd', {}, 'Entrée')), h('span', {}, 'envoyer le texte ou la consigne')),
        h('li', {}, h('span', {}, h('kbd', {}, 'Maj'), '+', h('kbd', {}, 'Entrée')), h('span', {}, 'aller à la ligne')),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Limites connues')),
      h(
        'ul',
        { class: 'plain-list' },
        h('li', {}, 'Transcription par segments : le texte apparaît après chaque pause, pas mot à mot (sauf poste rapide : texte provisoire).'),
        h('li', {}, 'Les petits modèles de rédaction peuvent omettre ou modifier des informations : leurs propositions sont vérifiées et écartées en cas d’écart sur les dates, doses, nombres, médicaments ou noms.'),
        h('li', {}, 'Le panneau Outlook peut bloquer le micro : utilisez alors la fenêtre séparée.'),
        h('li', {}, 'La recherche est une démonstration sur des messages fictifs.'),
        h('li', {}, 'Le raccourci clavier ne fonctionne que lorsque le panneau a le focus.'),
      ),
    ),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Historique de session')), hist),
    h('p', { class: 'version-line' }, `Assistant Outlook IA — version ${APP_VERSION} — logiciel libre, modèles open source.`),
  );
}
