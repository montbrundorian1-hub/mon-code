/**
 * Onglet « Aide » : confidentialité, limites connues, raccourcis, historique de session.
 */

import { APP_VERSION } from '../config';
import { clearHistory, getHistory, onHistoryChange } from '../security/sessionMemory';
import { button, h, replace } from '../ui/dom';

export function helpView(): HTMLElement {
  const hist = h('div');
  const renderHist = () => {
    const items = getHistory();
    replace(
      hist,
      h('p', { class: 'muted small' }, `${items.length} élément(s) en mémoire vive — effacé(s) à la fermeture du panneau ou après 30 min d’inactivité.`),
      items.length ? h('ul', { class: 'small' }, ...items.slice(0, 10).map((e) => h('li', {}, `${new Date(e.at).toLocaleTimeString('fr-FR')} — ${e.label}`))) : null,
      button('Effacer maintenant', () => clearHistory(), { kind: 'ghost' }),
    );
  };
  onHistoryChange(renderHist);
  renderHist();
  return h(
    'div',
    { class: 'view view-aide' },
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Confidentialité'),
      h(
        'ul',
        {},
        h('li', {}, 'La transcription et la rédaction s’exécutent sur ce poste. Aucun texte ni audio n’est envoyé à un service externe (garde réseau actif).'),
        h('li', {}, 'Seuls les poids des modèles sont téléchargés, après votre accord explicite.'),
        h('li', {}, 'Aucune dictée, aucun mail, aucun audio n’est enregistré durablement. L’historique reste en mémoire et s’efface à la fermeture.'),
        h('li', {}, 'Aucun mail n’est envoyé automatiquement : vous relisez et envoyez vous-même dans Outlook.'),
        h('li', { class: 'caution' }, 'Une IA locale n’est pas, à elle seule, une autorisation de traiter des données de patients. Utilisez uniquement des données fictives tant que votre établissement (DPO, RSSI) n’a pas validé l’usage.'),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Limites connues'),
      h(
        'ul',
        {},
        h('li', {}, 'Transcription par segments : le texte apparaît après chaque pause, pas mot à mot (sauf poste rapide : texte provisoire).'),
        h('li', {}, 'Les petits modèles de rédaction peuvent omettre ou modifier des informations : leurs propositions sont vérifiées et écartées en cas d’écart sur les dates, doses, nombres, médicaments ou noms.'),
        h('li', {}, 'Le panneau Outlook peut bloquer le micro : utilisez alors la fenêtre séparée.'),
        h('li', {}, 'La recherche est une démonstration sur des messages fictifs.'),
        h('li', {}, 'Le raccourci clavier ne fonctionne que lorsque le panneau a le focus.'),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Raccourcis'),
      h('ul', {}, h('li', {}, 'Ctrl + Maj + Espace (configurable) : démarrer / mettre en pause la dictée.'), h('li', {}, 'Échap : arrêt immédiat du micro.')),
    ),
    h('section', { class: 'card' }, h('h2', {}, 'Historique de session'), hist),
    h('p', { class: 'muted small center' }, `Assistant Outlook IA — version ${APP_VERSION} — logiciel libre, modèles open source.`),
  );
}
