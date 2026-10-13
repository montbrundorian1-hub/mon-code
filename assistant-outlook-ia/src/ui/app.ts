/**
 * Coquille de l'application : en-tête (état micro / IA / mode), navigation, vues, raccourcis.
 */

import { composeView } from '../components/composeView';
import { diagnosticView } from '../components/diagnosticView';
import { dictateView } from '../components/dictateView';
import { sendTextToParent } from '../components/dictationWindow';
import { helpView } from '../components/helpView';
import { replyView } from '../components/replyView';
import { searchView } from '../components/searchView';
import { settingsView } from '../components/settingsView';
import { detectCapabilities } from '../diagnostics/diagnostics';
import { DemoMailHost } from '../mock/demoHost';
import { registerCleanup } from '../security/sessionMemory';
import { loadSettings, updateSettings } from '../security/settings';
import { APP_NAME } from '../config';
import type { AppContext, TabId } from './context';
import { announce, button, formatDuration, h, icon, replace, toast, type IconName } from './dom';

const TABS: Array<{ id: TabId; label: string; icon: IconName; secondary?: boolean }> = [
  { id: 'dicter', label: 'Dicter', icon: 'mic' },
  { id: 'rediger', label: 'Rédiger', icon: 'pencil' },
  { id: 'repondre', label: 'Répondre', icon: 'reply' },
  { id: 'rechercher', label: 'Rechercher', icon: 'search' },
  { id: 'modeles', label: 'Modèles', icon: 'sliders', secondary: true },
  { id: 'diagnostic', label: 'Diagnostic', icon: 'activity', secondary: true },
  { id: 'aide', label: 'Aide', icon: 'help', secondary: true },
];

export function matchesShortcut(e: KeyboardEvent, id: string): boolean {
  switch (id) {
    case 'ctrl-shift-space':
      return e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'Space';
    case 'f8':
      return e.key === 'F8' && !e.ctrlKey && !e.altKey && !e.shiftKey;
    case 'alt-shift-d':
      return e.altKey && e.shiftKey && !e.ctrlKey && e.code === 'KeyD';
    default:
      return false;
  }
}

export function mountApp(root: HTMLElement, ctx: AppContext, opts: { dialogMode?: boolean } = {}): void {
  const views = new Map<TabId, HTMLElement>();
  const main = h('main', { class: 'content', id: 'content', tabindex: '-1' });
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Sections' });
  // Bandeau « micro actif » : dans l'en-tête collant, donc toujours visible, avec arrêt immédiat.
  const micBadge = h('section', { class: 'mic-badge', 'aria-label': 'État du micro', role: 'region', hidden: true });
  // Outils secondaires (Modèles, Diagnostic, Aide) : icônes dans l'en-tête, toujours accessibles.
  const tools = h('div', { class: 'header-tools', role: 'group', 'aria-label': 'Outils' });
  const aiBadge = h('span', { class: 'badge' });
  const modeBadge = h('span', { class: 'badge' });
  const header = h('header', { class: 'app-header' });
  let currentTab: TabId = 'dicter';

  const factories: Record<TabId, () => HTMLElement> = {
    dicter: () =>
      dictateView(ctx, {
        dialogMode: opts.dialogMode,
        onSendToParent: (text) => {
          if (sendTextToParent(text)) toast('Texte envoyé au panneau Outlook.', 'ok');
          else toast('Fenêtre d’origine introuvable : copiez le texte manuellement.', 'error');
        },
      }),
    rediger: () => composeView(ctx),
    repondre: () => replyView(ctx),
    rechercher: () => searchView(ctx),
    modeles: () => settingsView(ctx),
    diagnostic: () => diagnosticView(ctx),
    aide: () => helpView(),
  };

  const navigate = (tab: TabId) => {
    const changed = tab !== currentTab;
    currentTab = tab;
    let view = views.get(tab);
    if (!view) {
      view = factories[tab]();
      views.set(tab, view);
    }
    replace(main, view);
    root.querySelectorAll<HTMLButtonElement>('button.tab').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (changed) {
      document.scrollingElement?.scrollTo?.({ top: 0 });
      main.focus({ preventScroll: true });
      announce(`Section ${TABS.find((t) => t.id === tab)?.label ?? ''}`);
    }
  };
  ctx.navigate = navigate;

  // Vue « Rédiger » montée d'emblée : elle écoute l'événement de génération depuis la dictée.
  views.set('rediger', factories.rediger());

  for (const t of TABS) {
    if (opts.dialogMode && t.id !== 'dicter' && t.id !== 'modeles' && t.id !== 'aide') continue;
    const btn = h(
      'button',
      { type: 'button', class: `tab${t.secondary ? ' secondary' : ''}`, dataset: { tab: t.id }, onclick: () => navigate(t.id), title: t.label },
      icon(t.icon),
      h('span', { class: t.secondary ? 'tab-label sr-only' : 'tab-label' }, t.label),
    );
    (t.secondary ? tools : nav).append(btn);
  }
  if (opts.dialogMode) nav.classList.add('tabs-single');

  let micShown: boolean | null = null;
  let lastAi = '';
  let lastMode = '';
  // Chronomètre visuel seulement (aria-hidden) : pas d'annonce répétée par les lecteurs d'écran.
  const micTimer = h('span', { class: 'mic-timer', 'aria-hidden': 'true' });
  const renderBadges = () => {
    const active = ctx.micActive();
    // Ne reconstruit le bandeau que lors d'un changement d'état (pas à chaque tic du chronomètre).
    if (active !== micShown) {
      micShown = active;
      replace(
        micBadge,
        active
          ? h(
              'div',
              { class: 'mic-on', role: 'status' },
              h('span', { class: 'rec-dot', 'aria-hidden': 'true' }),
              h('span', { class: 'mic-on-text' }, 'Micro actif'),
              micTimer,
              button('Arrêter le micro', () => ctx.stopAllMic(), { kind: 'danger', icon: 'stop', size: 'sm', class: 'mic-stop' }),
            )
          : null,
      );
      micBadge.hidden = !active;
      header.classList.toggle('recording', active);
    }
    if (active) {
      const s = ctx.sessions().find((x) => x.isCapturing())?.snapshot();
      micTimer.textContent = s ? formatDuration(s.elapsedMs) : '';
    }
    const llm = ctx.llm.state;
    const busy = llm.status === 'downloading' || llm.status === 'loading';
    const aiText = llm.status === 'ready' ? 'IA locale prête' : busy ? 'IA : chargement…' : llm.status === 'error' ? 'IA : échec → mode classique' : 'Mode classique';
    if (aiText !== lastAi) {
      lastAi = aiText;
      aiBadge.className = `badge ${llm.status === 'ready' ? 'badge-ok' : busy ? 'badge-busy' : llm.status === 'error' ? 'badge-warn' : ''}`;
      replace(aiBadge, h('span', { class: 'dot', 'aria-hidden': 'true' }), aiText);
    }
    const info = ctx.host.info();
    const where = info.mode === 'compose' ? 'rédaction' : info.mode === 'read' ? 'lecture' : 'aucun';
    const modeText = info.kind === 'demo' ? `Démo · ${where}` : info.mode === 'none' ? 'Outlook' : `Outlook · ${where}`;
    if (demoSwitch) demoSwitch.value = info.mode === 'read' ? 'read' : 'compose';
    if (modeText !== lastMode) {
      lastMode = modeText;
      modeBadge.className = `badge ${info.kind === 'demo' ? 'badge-demo' : 'badge-ok'}`;
      replace(modeBadge, h('span', { class: 'dot', 'aria-hidden': 'true' }), modeText);
    }
  };
  ctx.on('mic', renderBadges);
  ctx.on('models', renderBadges);
  ctx.on('host', renderBadges);

  // Démonstration : le badge de mode est aussi le sélecteur de simulation (brouillon / message reçu).
  const demoSwitch =
    ctx.host instanceof DemoMailHost && !opts.dialogMode
      ? h(
          'select',
          {
            class: 'badge badge-demo pill-select demo-switch',
            'aria-label': 'Simulation Outlook (démonstration)',
            title: 'Simuler un brouillon ou un message reçu',
            onchange: (e: Event) => {
              (ctx.host as DemoMailHost).setMode((e.target as HTMLSelectElement).value as 'compose' | 'read');
              ctx.emit('host');
            },
          },
          h('option', { value: 'compose' }, 'Démo · rédaction'),
          h('option', { value: 'read' }, 'Démo · lecture'),
        )
      : null;
  if (demoSwitch) modeBadge.hidden = true;
  ctx.host.onItemChanged(() => ctx.emit('host'));

  const notice = h('div', { class: 'notice-slot' });
  if (!loadSettings().privacyNoticeRead) {
    replace(
      notice,
      h(
        'div',
        { class: 'notice welcome-card', role: 'region', 'aria-label': 'Bienvenue et confidentialité' },
        h('span', { class: 'welcome-icon', 'aria-hidden': 'true' }, icon('shield')),
        h(
          'div',
          { class: 'welcome-body' },
          h('strong', { class: 'welcome-title' }, 'Bienvenue !'),
          h('p', {}, 'Tout se passe sur ce poste : rien n’est envoyé automatiquement, rien n’est conservé après la fermeture.'),
          h(
            'p',
            { class: 'small muted' },
            'Prototype — données fictives uniquement. Une IA locale ne vaut pas autorisation de traiter des données de patients : n’utilisez des contenus réels qu’avec l’accord de votre établissement.',
          ),
          button(
            'J’ai compris',
            () => {
              updateSettings({ privacyNoticeRead: true });
              replace(notice);
              main.focus({ preventScroll: true });
            },
            { kind: 'primary', size: 'sm' },
          ),
        ),
      ),
    );
  }

  replace(
    header,
    h(
      'div',
      { class: 'header-row' },
      h(
        'h1',
        { class: 'brand' },
        h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('wave')),
        h('span', { class: 'brand-name' }, opts.dialogMode ? 'Dictée — fenêtre séparée' : APP_NAME),
      ),
      tools,
    ),
    h('div', { class: 'badges' }, demoSwitch, modeBadge, aiBadge),
    nav,
    micBadge,
  );
  replace(root, header, notice, main, h('footer', { class: 'app-footer' }, h('span', {}, 'Traitement local · aucun envoi automatique · aucune conservation')));

  // Ombre de l'en-tête au défilement (repère visuel discret).
  const onScroll = () => header.classList.toggle('scrolled', (document.scrollingElement?.scrollTop ?? 0) > 4);
  window.addEventListener('scroll', onScroll, { passive: true });

  // Accueil : message ouvert en lecture → « Répondre » ; sinon « Dicter ».
  currentTab = '' as TabId;
  navigate(!opts.dialogMode && ctx.host.info().mode === 'read' ? 'repondre' : 'dicter');
  renderBadges();

  // Raccourcis : uniquement quand le panneau a le focus (une page ne peut pas capter les touches d'Outlook).
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && ctx.micActive()) {
      ctx.stopAllMic();
      toast('Micro arrêté.', 'info');
      return;
    }
    const sc = loadSettings().shortcut;
    if (sc !== 'none' && matchesShortcut(e, sc)) {
      e.preventDefault();
      if (currentTab !== 'dicter') navigate('dicter');
      const s = ctx.dictation.snapshot();
      if (s.status === 'listening' || s.status === 'starting') ctx.dictation.pause();
      else if (s.status === 'paused') void ctx.dictation.resume();
      else void ctx.dictation.start();
    }
  };
  document.addEventListener('keydown', onKey);
  registerCleanup(() => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll);
    ctx.dispose();
  });

  // Capacités matérielles : détection asynchrone, sans bloquer l'affichage.
  void detectCapabilities().then((c) => {
    ctx.caps = c;
    ctx.emit('models');
  });
  void ctx.refreshRecipients().then(() => ctx.emit('host'));
}
