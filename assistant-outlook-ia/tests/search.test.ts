// Cas 28 : recherche simulée sur des messages fictifs ; recherche réelle désactivée.
import { describe, expect, it } from 'vitest';
import { analyzeMail, autoReplySkeleton } from '../src/ai/analyze';
import { DEMO_MESSAGES } from '../src/mock/messages';
import { DemoSearchProvider, ExchangeSearchProvider, parseQuery, searchMessages } from '../src/search/search';

const NOW = new Date('2026-03-15T12:00:00');

describe('cas 28 — recherche en langage naturel (démonstration)', () => {
  it('analyse expéditeur, période, dossier et mots-clés', () => {
    const q = parseQuery('les mails du Dr Fictif en mars sur le staff', NOW);
    expect(q.from).toBe('fictif');
    expect(q.after?.getMonth()).toBe(2);
    expect(q.terms.length).toBeGreaterThan(0);
    expect(parseQuery('documents de stage envoyés', NOW).folder).toBe('envoyés');
  });

  it('retrouve les messages pertinents', async () => {
    const p = new DemoSearchProvider(DEMO_MESSAGES);
    const hits = await p.search(parseQuery('amoxicilline', NOW));
    expect(hits[0].subject).toMatch(/amoxicilline/i);
    const fromFictif = searchMessages(DEMO_MESSAGES, parseQuery('mails du Dr Fictif en mars', NOW));
    expect(fromFictif.length).toBeGreaterThanOrEqual(2);
    expect(fromFictif.every((h) => /FICTIF/.test(h.from))).toBe(true);
    const sent = searchMessages(DEMO_MESSAGES, parseQuery('stage envoyés', NOW));
    expect(sent.every((h) => h.folder === 'envoyés')).toBe(true);
  });

  it('synonymes et accents (« reunion » trouve « staff »)', () => {
    expect(searchMessages(DEMO_MESSAGES, parseQuery('reunion', NOW)).length).toBeGreaterThan(0);
  });

  it('les données de démonstration sont fictives (domaine réservé exemple.test)', () => {
    for (const m of DEMO_MESSAGES) {
      expect(m.from.email.endsWith('@exemple.test')).toBe(true);
      for (const t of m.to) expect(t.email.endsWith('@exemple.test')).toBe(true);
    }
  });

  it('la recherche dans la boîte réelle est désactivée et l’explique', async () => {
    const real = new ExchangeSearchProvider();
    expect(real.unavailableReason()).toMatch(/ReadWriteMailbox/);
    await expect(real.search()).rejects.toThrow(/Désactivée/);
  });
});

describe('Analyse d’un message reçu fictif', () => {
  it('questions, demandes et dates', () => {
    const a = analyzeMail(DEMO_MESSAGES[0].body);
    expect(a.questions[0]).toMatch(/Pourriez-vous préparer/);
    expect(a.requests[0]).toMatch(/Merci de me dire/);
    expect(a.dates).toContain('13 h 30');
  });

  it('la trame automatique ne contient aucune réponse inventée', () => {
    const t = autoReplySkeleton(analyzeMail(DEMO_MESSAGES[1].body));
    expect(t).toMatch(/\[à compléter\]/);
    expect(t).not.toMatch(/\boui\b|\bnon\b|confirm/i);
  });
});
