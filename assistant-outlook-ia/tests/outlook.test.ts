// Cas 3–7, 22–25 : Office.js simulé, Exchange compatible/incompatible, modes, insertion, absence d'envoi.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapHost, isLikelyOfficeContext } from '../src/outlook/bootstrap';
import { OfficeMailHost } from '../src/outlook/officeAdapter';
import { textToHtml } from '../src/outlook/html';
import { DemoMailHost } from '../src/mock/demoHost';
import { installOfficeMock, removeOfficeMock } from './helpers/officeMock';

afterEach(() => removeOfficeMock());

describe('Initialisation Office.js (cas 3)', () => {
  it('passe en mode démonstration si Office.js est absent', async () => {
    removeOfficeMock();
    const boot = await bootstrapHost();
    expect(boot.officeScriptLoaded).toBe(false);
    expect(boot.host).toBeInstanceOf(DemoMailHost);
  });

  it('détecte Outlook après Office.onReady', async () => {
    installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const boot = await bootstrapHost(window, { officeContext: true });
    expect(boot.officeScriptLoaded).toBe(true);
    expect(boot.officeHost).toBe('Outlook');
    expect(boot.host).toBeInstanceOf(OfficeMailHost);
  });

  it('reste utilisable si Office.onReady échoue', async () => {
    const { Office } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    (Office as { onReady: () => Promise<unknown> }).onReady = () => Promise.reject(new Error('échec simulé'));
    const boot = await bootstrapHost(window, { officeContext: true });
    expect(boot.host).toBeInstanceOf(DemoMailHost);
    expect(boot.error).toMatch(/échec simulé/);
  });
});

describe('Contexte d’ouverture (audit n°2)', () => {
  it('ouverture directe dans le navigateur : démonstration immédiate, sans attendre Office.js', async () => {
    const { Office } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    // Office.js actuel ne répond jamais hors d'Outlook : la promesse reste en attente.
    (Office as { onReady: () => Promise<unknown> }).onReady = () => new Promise(() => undefined);
    const t0 = performance.now();
    const boot = await bootstrapHost(window, { officeContext: false });
    expect(performance.now() - t0).toBeLessThan(200);
    expect(boot.host).toBeInstanceOf(DemoMailHost);
    expect(boot.officeContext).toBe(false);
  });

  it('dans Outlook mais Office.js muet : repli démonstration après le délai, sans blocage', async () => {
    const { Office } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    (Office as { onReady: () => Promise<unknown> }).onReady = () => new Promise(() => undefined);
    const boot = await bootstrapHost(window, { officeContext: true, timeoutMs: 50 });
    expect(boot.host).toBeInstanceOf(DemoMailHost);
    expect(boot.error).toMatch(/délai/);
  });

  it('détecte un panneau Outlook (cadre) ou une adresse ouverte par Office (_host_Info)', () => {
    const framedWin = { location: { href: 'https://exemple.test/' } } as unknown as Window & { self: unknown; top: unknown };
    (framedWin as { self: unknown }).self = framedWin;
    (framedWin as { top: unknown }).top = {};
    expect(isLikelyOfficeContext(framedWin)).toBe(true);
    const topWin = { location: { href: 'https://exemple.test/?_host_Info=Outlook$Win32$16.02$fr-FR' } } as unknown as Window;
    (topWin as unknown as { self: unknown; top: unknown }).self = topWin;
    (topWin as unknown as { self: unknown; top: unknown }).top = topWin;
    expect(isLikelyOfficeContext(topWin)).toBe(true);
    const plain = { location: { href: 'https://exemple.test/' } } as unknown as Window;
    (plain as unknown as { self: unknown; top: unknown }).self = plain;
    (plain as unknown as { self: unknown; top: unknown }).top = plain;
    expect(isLikelyOfficeContext(plain)).toBe(false);
  });
});

describe('Exchange compatible (cas 4) / incompatible (cas 5)', () => {
  it('Exchange 2016/2019 (Mailbox 1.5) : jeux détectés et méthodes disponibles', () => {
    installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const info = new OfficeMailHost().info();
    expect(info.mailboxSets['1.5']).toBe(true);
    expect(info.mailboxSets['1.6']).toBe(false);
    expect(info.methods['body.setSelectedDataAsync']).toBe(true);
    expect(info.hostVersion).toBe('15.20.0.0');
  });

  it('Exchange 2013 (Mailbox 1.1 seulement) : lecture du corps refusée proprement', async () => {
    installOfficeMock({ mode: 'read', maxMailbox: '1.1' });
    const host = new OfficeMailHost();
    expect(host.info().mailboxSets['1.3']).toBe(false);
    await expect(host.readBody()).rejects.toThrow(/Mailbox 1\.3/);
  });

  it('client sans setSelectedDataAsync : repli sur prependAsync (Mailbox 1.1)', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.1', withSetSelected: false });
    const r = await new OfficeMailHost().insertText('Texte fictif', 'cursor');
    // L'utilisateur est prévenu que le texte a été placé en tête du message (curseur indisponible).
    expect(r).toEqual({ ok: true, method: 'prependAsync', atStartInsteadOfCursor: true });
    expect(calls.prependAsync).toHaveBeenCalledOnce();
  });

  it('aucune méthode d’insertion : erreur explicite', async () => {
    installOfficeMock({ mode: 'compose', maxMailbox: '1.1', withSetSelected: false, withPrepend: false });
    const r = await new OfficeMailHost().insertText('Texte fictif', 'cursor');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Aucune méthode d’insertion/);
  });
});

describe('Modes composition (cas 6) et lecture (cas 7)', () => {
  it('composition : destinataires lus pour adapter le ton', async () => {
    installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const host = new OfficeMailHost();
    expect(host.info().mode).toBe('compose');
    expect(await host.getRecipients()).toEqual([{ displayName: 'Dr FICTIF Alice', email: 'a.fictif@exemple.test' }]);
    expect(await host.getSubject()).toBe('Sujet fictif');
  });

  it('lecture : expéditeur, corps converti en texte, réponse préremplie sans envoi', async () => {
    const { calls } = installOfficeMock({ mode: 'read', maxMailbox: '1.5' });
    const host = new OfficeMailHost();
    expect(host.info().mode).toBe('read');
    expect((await host.getSender())?.displayName).toBe('Pr EXEMPLE Bruno');
    expect(await host.readBody()).toMatch(/Message fictif de test/);
    expect(calls.getAsync).toHaveBeenCalledWith('html');
    const r = await host.openReplyForm('Réponse fictive');
    expect(r.ok).toBe(true);
    expect(calls.displayReplyForm).toHaveBeenCalledOnce();
    const ins = await host.insertText('x', 'cursor');
    expect(ins.ok).toBe(false);
  });
});

describe('Insertion (cas 22–24)', () => {
  it('insère au curseur en HTML échappé (cas 22)', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const r = await new OfficeMailHost().insertText('Bonjour <b>Docteur</b>,\n\n- point 1\n- point 2', 'cursor');
    expect(r).toEqual({ ok: true, method: 'setSelectedDataAsync' });
    const [data, opts] = calls.setSelectedDataAsync.mock.calls[0];
    expect(opts).toEqual({ coercionType: 'html' });
    expect(data).toContain('&lt;b&gt;Docteur&lt;/b&gt;');
    expect(data).toContain('<ul><li>point 1</li><li>point 2</li></ul>');
  });

  it('insère du texte brut si le brouillon est en texte', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5', bodyType: 'text' });
    await new OfficeMailHost().insertText('Texte fictif', 'cursor');
    expect(calls.setSelectedDataAsync.mock.calls[0][1]).toEqual({ coercionType: 'text' });
  });

  it('curseur refusé par Outlook : repli en tête du message, signalé (audit n°2)', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5', failSetSelected: { code: 'InvalidSelection', message: 'x' } });
    const r = await new OfficeMailHost().insertText('Texte fictif', 'cursor');
    expect(r).toEqual({ ok: true, method: 'prependAsync', atStartInsteadOfCursor: true });
    expect(calls.prependAsync).toHaveBeenCalledOnce();
  });

  it('erreur Office.js d’insertion : message compréhensible (cas 23)', async () => {
    installOfficeMock({ mode: 'compose', maxMailbox: '1.5', withPrepend: false, failSetSelected: { code: 9041, message: 'Permission' } });
    const r = await new OfficeMailHost().insertText('Texte fictif', 'cursor');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/droits nécessaires/);
  });

  it('ne remplace jamais le corps entier : texte existant et signature préservés (cas 24)', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const host = new OfficeMailHost();
    await host.insertText('Premier texte', 'cursor');
    await host.insertText('Deuxième texte', 'start');
    expect(calls.setAsync).not.toHaveBeenCalled();

    const demo = new DemoMailHost();
    demo.draftBody = 'Texte déjà présent.';
    await demo.insertText('Texte inséré fictif.', 'cursor');
    expect(demo.fullDraft()).toContain('Texte inséré fictif.');
    expect(demo.fullDraft()).toContain('Texte déjà présent.');
    expect(demo.fullDraft()).toContain(demo.signature);
  });

  it('textToHtml termine par une ligne vide séparant le texte existant', () => {
    expect(textToHtml('a')).toBe('<div>a</div><div><br></div>');
  });
});

describe('Aucun envoi automatique (cas 25)', () => {
  it('les adaptateurs n’exposent aucune méthode d’envoi et n’appellent jamais sendAsync', async () => {
    const { calls } = installOfficeMock({ mode: 'compose', maxMailbox: '1.5' });
    const host = new OfficeMailHost();
    await host.insertText('Texte fictif', 'cursor');
    expect(calls.sendAsync).not.toHaveBeenCalled();
    for (const proto of [OfficeMailHost.prototype, DemoMailHost.prototype]) {
      expect(Object.getOwnPropertyNames(proto).filter((n) => /^send|send(Async|Mail|Item)/i.test(n))).toEqual([]);
    }
  });

  it('le code source ne contient aucun appel d’envoi de mail', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(__dirname, '..', 'src'));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\.sendAsync\s*\(|item\.send\s*\(|SendItem|CreateItem/);
    }
  });
});
