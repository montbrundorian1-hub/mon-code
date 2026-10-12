// Cas 2, 6, 7, 21, 29 : démarrage de l'interface, modes composition/lecture, affichage de l'original,
// fonctionnalités indisponibles signalées. Exécuté dans jsdom avec l'hôte de démonstration.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemoMailHost } from '../src/mock/demoHost';
import { _resetSettingsForTests } from '../src/security/settings';
import { AppContext } from '../src/ui/context';
import { mountApp, matchesShortcut } from '../src/ui/app';
import type { BootResult } from '../src/outlook/bootstrap';

function boot(host = new DemoMailHost()): BootResult {
  return { host, officeScriptLoaded: false, officeHost: null, readyMs: null, error: null, officeContext: false };
}

/** Worker factice : aucun modèle n'est chargé dans ces tests d'interface. */
const noWorker = () => ({ postMessage() {}, terminate() {}, onmessage: null, onerror: null }) as unknown as Worker;

let root: HTMLElement;
let ctx: AppContext;
beforeEach(() => {
  _resetSettingsForTests();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => ctx?.dispose());

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('cas 2 — démarrage de l’application', () => {
  it('affiche l’en-tête, les 4 sections principales et l’avertissement de confidentialité', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    await tick();
    const labels = (sel: string) => [...root.querySelectorAll(`${sel} .tab .tab-label`)].map((e) => e.textContent);
    expect(labels('nav')).toEqual(['Dicter', 'Rédiger', 'Répondre', 'Rechercher']);
    expect(labels('.header-tools')).toEqual(['Modèles', 'Diagnostic', 'Aide']);
    expect(root.querySelector('h1')?.textContent).toBe('Assistant Outlook IA');
    expect(root.querySelector('.notice')?.textContent).toMatch(/données fictives/);
    expect(root.querySelector('.mic-button')).not.toBeNull();
    expect(root.querySelector('.app-footer')?.textContent).toMatch(/aucun envoi automatique/);
  });

  it('le mode fenêtre de dictée n’affiche que la dictée', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx, { dialogMode: true });
    expect([...root.querySelectorAll('.tab .tab-label')].map((e) => e.textContent).sort()).toEqual(['Aide', 'Dicter', 'Modèles']);
  });
});

describe('cas 6 / 7 — modes composition et lecture', () => {
  it('composition : bouton « Insérer dans Outlook »', async () => {
    const host = new DemoMailHost();
    ctx = new AppContext(boot(host), noWorker);
    mountApp(root, ctx);
    ctx.navigate('rediger');
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Texte original"]')!;
    ta.value = 'bonjour je vous confirme le staff de jeudi à 14 h 30';
    root.querySelector<HTMLButtonElement>('#btn-redact')!.click();
    await tick();
    expect(root.querySelector('.badges')?.textContent).toMatch(/Démo · rédaction/);
    expect(root.querySelector('#btn-insert-draft')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('#btn-insert-draft')!.click();
    await tick();
    expect(host.fullDraft()).toMatch(/staff de jeudi/);
    expect(host.fullDraft()).toContain(host.signature);
  });

  it('lecture : analyse d’un message fictif et réponse préremplie (sans envoi)', async () => {
    const host = new DemoMailHost();
    ctx = new AppContext(boot(host), noWorker);
    mountApp(root, ctx);
    ctx.navigate('repondre');
    root.querySelector<HTMLButtonElement>('#btn-analyze')!.click();
    await tick();
    expect(host.mode).toBe('read');
    expect(root.textContent).toMatch(/Questions détectées/);
    root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Intentions de réponse"]')!.value = 'oui, je prépare la présentation pour jeudi';
    root.querySelector<HTMLButtonElement>('#btn-reply')!.click();
    await tick();
    const reply = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Réponse (modifiable)"]')!.value;
    expect(reply).toMatch(/^Bonjour Docteur Fictif,/);
    const openBtn = [...root.querySelectorAll('button')].find((b) => /réponse préremplie/.test(b.textContent ?? ''))!;
    openBtn.click();
    await tick();
    expect(host.openedReplies).toHaveLength(1);
  });
});

describe('cas 21 — affichage de la transcription originale et comparaison', () => {
  it('onglets Original / Différences', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    ctx.navigate('rediger');
    root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Texte original"]')!.value = 'euh bonjour je confirme la sortie demain';
    root.querySelector<HTMLButtonElement>('#btn-redact')!.click();
    await tick();
    const tab = (name: string) => [...root.querySelectorAll<HTMLButtonElement>('.tab-inline')].find((b) => b.textContent === name)!;
    tab('Original').click();
    expect(root.querySelector('.view-rediger .pre')?.textContent).toBe('euh bonjour je confirme la sortie demain');
    tab('Différences').click();
    expect(root.querySelector('.diff-body del')?.textContent).toMatch(/euh/);
  });
});

describe('cas 29 — fonctionnalités indisponibles affichées explicitement', () => {
  it('IA non chargée, recherche réelle désactivée, micro sans modèle', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    await tick();
    expect(root.querySelector('.badges')?.textContent).toMatch(/Mode classique/);
    expect((root.querySelector('.mic-button') as HTMLButtonElement).disabled).toBe(true);
    expect(root.textContent).toMatch(/Chargez d’abord un modèle de transcription/);
    ctx.navigate('rechercher');
    expect(root.textContent).toMatch(/Boîte réelle : Désactivée en V1/);
    ctx.navigate('rediger');
    expect(root.textContent).toMatch(/IA locale non chargée : mode classique/);
    ctx.navigate('repondre');
    root.querySelector<HTMLButtonElement>('#btn-analyze')!.click();
    await tick();
    const assistantTab = [...root.querySelectorAll<HTMLButtonElement>('.tab-inline')].find((b) => b.textContent === 'Assistant')!;
    assistantTab.click();
    expect(root.textContent).toMatch(/Nécessite un modèle IA local/);
  });
});

describe('Raccourcis clavier', () => {
  it('Ctrl+Maj+Espace / F8 / Alt+Maj+D', () => {
    expect(matchesShortcut(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, code: 'Space' }), 'ctrl-shift-space')).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { ctrlKey: true, code: 'Space' }), 'ctrl-shift-space')).toBe(false);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'F8' }), 'f8')).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyD' }), 'alt-shift-d')).toBe(true);
    expect(matchesShortcut(new KeyboardEvent('keydown', { key: 'F8' }), 'none')).toBe(false);
  });
});
