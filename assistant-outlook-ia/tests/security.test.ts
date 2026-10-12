// Cas 26–27 : aucune persistance de contenu utilisateur, aucune transmission vers un service externe.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Assistant } from '../src/ai/assistant';
import { ALLOWED_EXTERNAL_HOSTS } from '../src/config';
import { _resetGuardForTests, BlockedRequestError, evaluateRequest, getGuardEvents, hostMatches, installNetworkGuard } from '../src/security/networkGuard';
import { describeOfficeError, redactText } from '../src/security/redact';
import { _setLastActivityForTests, addHistory, clearHistory, expireIfIdle, getHistory } from '../src/security/sessionMemory';
import { _resetSettingsForTests, loadSettings, sanitizeSettings, settingsStorageKey, updateSettings } from '../src/security/settings';

const POLICY = { selfOrigin: 'https://app.exemple.test', allowedHosts: ALLOWED_EXTERNAL_HOSTS.map((h) => h.host) };

describe('cas 27 — garde réseau : aucune transmission de texte ou d’audio', () => {
  it('autorise uniquement les GET sans corps vers la liste blanche', () => {
    expect(evaluateRequest('https://huggingface.co/onnx-community/whisper-small/resolve/main/config.json', 'GET', false, POLICY).allowed).toBe(true);
    expect(evaluateRequest('https://cas-bridge.xethub.hf.co/x', 'GET', false, POLICY).allowed).toBe(true);
    expect(evaluateRequest('/assets/app.js', 'GET', false, POLICY).allowed).toBe(true);
    expect(evaluateRequest('blob:https://app.exemple.test/123', 'GET', false, POLICY).allowed).toBe(true);
  });

  it('bloque tout envoi de données vers l’extérieur, même vers un hôte autorisé', () => {
    expect(evaluateRequest('https://huggingface.co/api/inference', 'POST', true, POLICY).allowed).toBe(false);
    expect(evaluateRequest('https://huggingface.co/x', 'GET', true, POLICY).allowed).toBe(false);
    expect(evaluateRequest(`https://huggingface.co/x?q=${'a'.repeat(600)}`, 'GET', false, POLICY).allowed).toBe(false);
  });

  it('bloque les services d’IA ou de reconnaissance vocale cloud et l’HTTP non chiffré', () => {
    for (const url of [
      'https://api.openai.com/v1/chat/completions',
      'https://api-inference.huggingface.co.evil.test/x',
      'https://speech.platform.bing.com/recognize',
      'https://www.google-analytics.com/collect',
      'http://huggingface.co/x',
    ]) {
      expect(evaluateRequest(url, 'GET', false, POLICY).allowed, url).toBe(false);
    }
    expect(hostMatches('cdn-lfs.huggingface.co', '*.huggingface.co')).toBe(true);
    expect(hostMatches('huggingface.co.evil.test', '*.huggingface.co')).toBe(false);
  });

  it('intercepte réellement fetch, XHR, sendBeacon et WebSocket', async () => {
    _resetGuardForTests();
    const realFetch = vi.fn(async () => new Response('ok'));
    const scope = {
      fetch: realFetch,
      navigator: { sendBeacon: vi.fn(() => true) },
      XMLHttpRequest: class {
        open() {}
        send() {}
      },
      WebSocket: class {},
    } as unknown as typeof globalThis;
    installNetworkGuard(POLICY, scope);
    await expect(scope.fetch('https://api.openai.com/v1/x', { method: 'POST', body: 'texte de dictée fictif' })).rejects.toBeInstanceOf(BlockedRequestError);
    expect(realFetch).not.toHaveBeenCalled();
    await scope.fetch('https://huggingface.co/model/config.json');
    expect(realFetch).toHaveBeenCalledOnce();
    expect(scope.navigator.sendBeacon('https://telemetrie.exemple.test/', 'x')).toBe(false);
    const xhr = new scope.XMLHttpRequest();
    xhr.open('POST', 'https://huggingface.co/api');
    expect(() => xhr.send('contenu')).toThrow(BlockedRequestError);
    expect(() => new scope.WebSocket('wss://exemple.test')).toThrow(BlockedRequestError);
    // Le journal ne retient que l'hôte, jamais l'URL complète ni le contenu.
    const log = JSON.stringify(getGuardEvents());
    expect(log).not.toMatch(/dictée|v1\/x|contenu/);
    _resetGuardForTests();
  });

  it('la rédaction (classique comme IA locale) n’effectue aucune requête réseau', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const a = new Assistant({ id: 'f', label: 'f', isReady: () => true, generate: async () => 'Bonjour,\n\nTexte fictif.\n\nCordialement,' });
    await a.draftFromDictation('bonjour texte fictif', { recipients: [], formality: 'auto' }, { useAi: true });
    await a.applyCommand('Bonjour,\n\nTexte fictif.', { kind: 'shorter', instruction: 'plus court' }, { useAi: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('cas 26 — aucune sauvegarde permanente de contenu utilisateur', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    _resetSettingsForTests();
    clearHistory();
  });

  it('les préférences refusent tout texte libre', () => {
    const s = sanitizeSettings({ asrModel: 'Bonjour Docteur Martin, amoxicilline 1 g', llmModel: 'qwen3-0.6b', shortcut: 'texte', extra: 'dictée' });
    expect(s.asrModel).toBe('');
    expect(s.llmModel).toBe('qwen3-0.6b');
    expect(s.shortcut).toBe('ctrl-shift-space');
    expect(JSON.stringify(s)).not.toMatch(/dictée|Martin/);
  });

  it('l’historique de session reste en mémoire et n’écrit dans aucun stockage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    addHistory({ kind: 'dictation', label: 'Dictée', original: 'Madame Dupont fictive, amoxicilline 1 g', result: '' });
    expect(getHistory()).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('l’historique expire après inactivité', () => {
    addHistory({ kind: 'draft', label: 'x', original: 'a', result: 'b' });
    _setLastActivityForTests(Date.now() - 31 * 60 * 1000);
    expireIfIdle();
    expect(getHistory()).toHaveLength(0);
  });

  it('seule la clé de préférences est écrite dans localStorage', () => {
    updateSettings({ cacheModels: true, asrModel: 'whisper-small' });
    expect(Object.keys(localStorage)).toEqual([settingsStorageKey()]);
    expect(loadSettings().cacheModels).toBe(true);
  });
});

describe('Expurgation des messages d’erreur et diagnostics', () => {
  it('masque adresses, URLs, numéros longs et citations', () => {
    const r = redactText('Erreur pour jean.dupont@chu-exemple.test sur https://serveur.exemple.test/owa/?id=123 dossier 1 85 05 78 006 084 « Madame Dupont a une pneumopathie »');
    expect(r).not.toMatch(/jean\.dupont|owa\/\?id|85 05|pneumopathie/);
    expect(r).toContain('<url:serveur.exemple.test>');
  });

  it('traduit les codes d’erreur Office.js', () => {
    expect(describeOfficeError({ code: 9041 })).toMatch(/droits/);
    expect(describeOfficeError({ name: 'InvalidSelection' })).toMatch(/curseur/);
  });
});
