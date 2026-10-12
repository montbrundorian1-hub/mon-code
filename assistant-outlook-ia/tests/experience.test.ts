// Parcours de la nouvelle interface (audit n°2), dans jsdom avec l'hôte de démonstration.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationResult, TextGenerationProvider } from '../src/ai/assistant';
import { runDiagnostics } from '../src/diagnostics/diagnostics';
import { DemoMailHost } from '../src/mock/demoHost';
import type { BootResult } from '../src/outlook/bootstrap';
import type { InsertResult } from '../src/outlook/types';
import { _resetSettingsForTests, updateSettings } from '../src/security/settings';
import { mountApp } from '../src/ui/app';
import { AppContext } from '../src/ui/context';

function boot(host = new DemoMailHost()): BootResult {
  return { host, officeScriptLoaded: false, officeHost: null, readyMs: null, error: null, officeContext: false };
}
const noWorker = () => ({ postMessage() {}, terminate() {}, onmessage: null, onerror: null }) as unknown as Worker;
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

let root: HTMLElement;
let ctx: AppContext;
beforeEach(() => {
  _resetSettingsForTests();
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => ctx?.dispose());

/** Saisie dans la zone de saisie de « Rédiger », puis envoi. */
async function draft(text: string): Promise<void> {
  ctx.navigate('rediger');
  const ta = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Texte original"]')!;
  ta.value = text;
  ta.dispatchEvent(new Event('input'));
  root.querySelector<HTMLButtonElement>('#btn-redact')!.click();
  await tick();
}
const draftText = () => root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Version rédigée (modifiable)"]')!.value;

describe('Rédiger : conversation avec l’assistant', () => {
  it('après rédaction, la zone de saisie sert aux consignes ; « Annuler » et « Nouveau mail »', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    await draft('bonjour docteur martin je vous confirme le staff de jeudi à 14 h 30');
    expect(root.querySelector('.msg-user .bubble')?.textContent).toMatch(/staff de jeudi/);
    const first = draftText();
    const input = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Consigne de modification"]')!;
    expect(input).not.toBeNull();
    input.value = 'transforme en liste';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(draftText()).toMatch(/\n- /);
    expect([...root.querySelectorAll('.msg-user .bubble')].map((b) => b.textContent)).toContain('transforme en liste');
    expect(root.querySelector('.note')?.textContent).toBeTruthy();
    root.querySelector<HTMLButtonElement>('#btn-undo')!.click();
    await tick();
    expect(draftText()).toBe(first);
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Nouveau mail')!.click();
    await tick();
    expect(root.querySelector('.welcome')).not.toBeNull();
    expect(root.querySelector('textarea[aria-label="Texte original"]')).not.toBeNull();
  });

  it('la vérification est recalculée après une modification (pas de résultat périmé)', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    await draft('bonjour je confirme le rendez-vous de jeudi à 14 h 30');
    expect(root.querySelector('.verify-ok')).not.toBeNull();
    const input = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Consigne de modification"]')!;
    input.value = 'remplace 14 h 30 par 15 h';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(draftText()).toMatch(/15 h/);
    const warn = root.querySelector('.verify-warn');
    expect(warn?.textContent).toMatch(/14 h 30/);
  });

  it('réglage « ponctuation dictée » réellement appliqué (constat de l’audit n°2)', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    await draft('bonjour virgule je confirme le staff point');
    expect(draftText()).toMatch(/Bonjour,/);
    expect(draftText()).not.toMatch(/virgule/);
    updateSettings({ dictatedPunctuation: false });
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Nouveau mail')!.click();
    await draft('bonjour virgule je confirme le staff point');
    expect(draftText()).toMatch(/virgule/i);
  });

  it('bouton « Arrêter » : la génération IA s’interrompt, la version sans IA est conservée', async () => {
    ctx = new AppContext(boot(), noWorker);
    let release: ((r: GenerationResult) => void) | null = null;
    const provider: TextGenerationProvider = {
      id: 'fake',
      label: 'IA factice',
      isReady: () => true,
      generate: () => new Promise<GenerationResult>((r) => (release = r)),
      interrupt: vi.fn(() => release?.({ text: 'Bonjour, texte partiel', interrupted: true })),
    };
    ctx.assistant.setProvider(provider);
    ctx.llm.isReady = () => true;
    mountApp(root, ctx);
    ctx.emit('models');
    ctx.navigate('rediger');
    root.querySelector<HTMLButtonElement>('.ai-toggle')!.click();
    expect(root.querySelector('.ai-toggle')?.getAttribute('aria-pressed')).toBe('true');
    await draft('bonjour je confirme le staff de jeudi à 14 h 30');
    const send = root.querySelector<HTMLButtonElement>('#btn-redact')!;
    expect(send.getAttribute('aria-label')).toBe('Arrêter');
    expect(root.querySelector('.view-rediger .busy')?.hasAttribute('hidden')).toBe(false);
    send.click();
    await tick();
    expect(provider.interrupt).toHaveBeenCalled();
    expect(root.querySelector('.view-rediger .busy')?.hasAttribute('hidden')).toBe(true);
    expect(root.textContent).toMatch(/Amélioration par l’IA arrêtée/);
    expect(draftText()).toMatch(/^Bonjour,/);
  });

  it('repli d’insertion en tête du message : l’utilisateur est prévenu', async () => {
    class CursorlessHost extends DemoMailHost {
      override insertText(): Promise<InsertResult> {
        return Promise.resolve({ ok: true, method: 'prependAsync', atStartInsteadOfCursor: true });
      }
    }
    ctx = new AppContext(boot(new CursorlessHost()), noWorker);
    mountApp(root, ctx);
    await draft('bonjour je confirme le staff');
    root.querySelector<HTMLButtonElement>('#btn-insert-draft')!.click();
    await tick();
    expect(document.querySelector('.toasts')?.textContent).toMatch(/Curseur indisponible : texte inséré en tête du message/);
  });
});

describe('Accueil et en-tête', () => {
  it('message ouvert en lecture : l’assistant s’ouvre sur « Répondre »', async () => {
    const host = new DemoMailHost();
    host.setMode('read');
    ctx = new AppContext(boot(host), noWorker);
    mountApp(root, ctx);
    await tick();
    expect(root.querySelector('.tab.active')?.textContent).toMatch(/Répondre/);
    expect(root.querySelector('#btn-analyze')).not.toBeNull();
  });

  it('salutation avec le prénom de l’utilisateur (lu localement, jamais stocké)', async () => {
    class NamedHost extends DemoMailHost {
      override userDisplayName(): string | null {
        return 'MARTIN Camille';
      }
    }
    ctx = new AppContext(boot(new NamedHost()), noWorker);
    mountApp(root, ctx);
    await tick();
    expect(root.querySelector('.hero-kicker')?.textContent).toMatch(/^(Bonjour|Bonsoir) Camille$/);
    expect(JSON.stringify(localStorage)).not.toMatch(/Camille/);
  });

  it('démonstration : le badge de mode permet de simuler un message reçu', async () => {
    const host = new DemoMailHost();
    ctx = new AppContext(boot(host), noWorker);
    mountApp(root, ctx);
    const sel = root.querySelector<HTMLSelectElement>('select.demo-switch')!;
    expect(sel.value).toBe('compose');
    sel.value = 'read';
    sel.dispatchEvent(new Event('change'));
    expect(host.mode).toBe('read');
  });
});

describe('Rechercher : mots retrouvés mis en évidence', () => {
  it('les résultats surlignent les mots recherchés', async () => {
    ctx = new AppContext(boot(), noWorker);
    mountApp(root, ctx);
    ctx.navigate('rechercher');
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'amoxicilline';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await tick();
    const marks = [...root.querySelectorAll('.result mark')].map((m) => m.textContent?.toLowerCase());
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m?.startsWith('amoxicillin'))).toBe(true);
  });
});

describe('Diagnostic', () => {
  it('signale l’ouverture directe (démonstration immédiate) et la piste native à titre informatif', async () => {
    const checks = await runDiagnostics(boot());
    const ctxCheck = checks.find((c) => c.id === 'office-context');
    expect(ctxCheck?.value).toMatch(/ouverture directe/);
    const native = checks.find((c) => c.id === 'native-sr');
    expect(native?.status).toBe('info');
    expect(native?.detail).toMatch(/Whisper/);
    expect(checks.find((c) => c.id === 'office-script')?.status).toBe('warn');
  });

  it('dans Outlook : source d’Office.js indiquée', async () => {
    const checks = await runDiagnostics({ ...boot(), officeScriptLoaded: true, officeContext: true });
    expect(checks.find((c) => c.id === 'office-script')?.detail).toMatch(/officeapis\.public\.onecdn\.static\.microsoft/);
    expect(checks.find((c) => c.id === 'office-context')?.status).toBe('ok');
  });
});
