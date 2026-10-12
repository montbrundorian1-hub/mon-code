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
import { button, h, icon, replace, toast } from './dom';

const TABS: Array<{ id: TabId; label: string; icon: Parameters<typeof icon>[0]; secondary?: boolean }> = [
  { id: 'dicter', label: 'Dicter', icon: 'mic' },
  { id: 'rediger', label: 'Rédiger', icon: 'insert' },
  { id: 'repondre', label: 'Répondre', icon: 'chat' },
  { id: 'rechercher', label: 'Rechercher', icon: 'search' },
  { id: 'modeles', label: 'Modèles', icon: 'gear', secondary: true },
  { id: 'diagnostic', label: 'Diagnostic', icon: 'pulse', secondary: true },
  { id: 'aide', label: 'Aide', icon: 'info', secondary: true },
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
  const main = h('main', { class: 'content', id: 'content' });
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Sections' });
  const micBadge = h('div', { class: 'mic-badge', role: 'status', 'aria-live': 'assertive' });
  const aiBadge = h('span', { class: 'badge' });
  const modeBadge = h('span', { class: 'badge' });
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
    currentTab = tab;
    if (!views.has(tab)) views.set(tab, factories[tab]());
    replace(main, views.get(tab)!);
    nav.querySelectorAll('button').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    main.focus({ preventScroll: true });
  };
  ctx.navigate = navigate;

  // Vue « Rédiger » montée d'emblée : elle écoute l'événement de génération depuis la dictée.
  views.set('rediger', factories.rediger());

  for (const t of TABS) {
    if (opts.dialogMode && t.id !== 'dicter' && t.id !== 'modeles' && t.id !== 'aide') continue;
    nav.append(
      h('button', { type: 'button', class: `tab ${t.secondary ? 'secondary' : ''}`, dataset: { tab: t.id }, onclick: () => navigate(t.id), title: t.label }, icon(t.icon), h('span', { class: 'tab-label' }, t.label)),
    );
  }

  const renderBadges = () => {
    const active = ctx.micActive();
    replace(
      micBadge,
      active ? h('span', { class: 'mic-on' }, h('span', { class: 'rec-dot' }), 'Micro actif', button('Arrêter', () => ctx.stopAllMic(), { kind: 'danger', icon: 'stop' })) : null,
    );
    micBadge.hidden = !active;
    const llm = ctx.llm.state;
    aiBadge.className = `badge ${llm.status === 'ready' ? 'badge-ok' : llm.status === 'downloading' || llm.status === 'loading' ? 'badge-busy' : ''}`;
    aiBadge.textContent =
      llm.status === 'ready' ? 'IA locale prête' : llm.status === 'downloading' || llm.status === 'loading' ? 'IA : chargement…' : llm.status === 'error' ? 'IA : échec → classique' : 'Mode classique';
    const info = ctx.host.info();
    modeBadge.textContent = info.kind === 'demo' ? `Démo · ${info.mode === 'compose' ? 'rédaction' : info.mode === 'read' ? 'lecture' : 'aucun'}` : info.mode === 'compose' ? 'Outlook · rédaction' : info.mode === 'read' ? 'Outlook · lecture' : 'Outlook';
    modeBadge.className = `badge ${info.kind === 'demo' ? 'badge-demo' : 'badge-ok'}`;
  };
  ctx.on('mic', renderBadges);
  ctx.on('models', renderBadges);
  ctx.on('host', renderBadges);

  const demoSwitch =
    ctx.host instanceof DemoMailHost && !opts.dialogMode
      ? h(
          'select',
          {
            class: 'demo-switch',
            'aria-label': 'Simulation Outlook',
            onchange: (e: Event) => {
              (ctx.host as DemoMailHost).setMode((e.target as HTMLSelectElement).value as 'compose' | 'read');
              ctx.emit('host');
            },
          },
          h('option', { value: 'compose' }, 'Simuler : brouillon'),
          h('option', { value: 'read' }, 'Simuler : message reçu'),
        )
      : null;
  ctx.host.onItemChanged(() => {
    if (demoSwitch) (demoSwitch as HTMLSelectElement).value = ctx.host.info().mode === 'read' ? 'read' : 'compose';
    ctx.emit('host');
  });

  const notice = h('div');
  if (!loadSettings().privacyNoticeRead) {
    replace(
      notice,
      h(
        'div',
        { class: 'alert alert-info notice' },
        h('strong', {}, 'Prototype — données fictives uniquement. '),
        'Traitement local, aucun envoi automatique. Une IA locale ne vaut pas autorisation de traiter des données de patients : n’utilisez des contenus réels qu’avec l’accord de votre établissement.',
        button(
          'J’ai compris',
          () => {
            updateSettings({ privacyNoticeRead: true });
            replace(notice);
          },
          { kind: 'ghost' },
        ),
      ),
    );
  }

  replace(
    root,
    h(
      'header',
      { class: 'app-header' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, icon('mic')), h('span', {}, opts.dialogMode ? 'Dictée — fenêtre séparée' : APP_NAME)),
      h('div', { class: 'badges' }, modeBadge, aiBadge, demoSwitch),
    ),
    micBadge,
    nav,
    notice,
    main,
    h('footer', { class: 'app-footer' }, 'Traitement local · aucun envoi automatique · aucune conservation'),
  );
  main.setAttribute('tabindex', '-1');
  navigate('dicter');
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
      if (s.status === 'listening') void ctx.dictation.pause();
      else if (s.status === 'paused') void ctx.dictation.resume();
      else void ctx.dictation.start();
    }
  };
  document.addEventListener('keydown', onKey);
  registerCleanup(() => {
    document.removeEventListener('keydown', onKey);
    ctx.dispose();
  });

  // Capacités matérielles : détection asynchrone, sans bloquer l'affichage.
  void detectCapabilities().then((c) => {
    ctx.caps = c;
    ctx.emit('models');
  });
  void ctx.refreshRecipients().then(() => ctx.emit('host'));
}
