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

describe('Corrections de l’audit n°2 — recherche', () => {
  const people = new DemoSearchProvider(DEMO_MESSAGES).people;
  const run = (text: string) => searchMessages(DEMO_MESSAGES, parseQuery(text, NOW, people));

  it('« documents de stage envoyés » (exemple proposé) trouve le message envoyé sur le stage', () => {
    const q = parseQuery('documents de stage envoyés', NOW, people);
    expect(q.from).toBeUndefined();
    expect(q.folder).toBe('envoyés');
    const hits = run('documents de stage envoyés');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].subject).toMatch(/stage/i);
  });

  it('« réponse du secrétariat » : expéditeur connu, même en minuscules', () => {
    const q = parseQuery('réponse du secrétariat', NOW, people);
    expect(q.from).toBe('secretariat');
    expect(run('réponse du secrétariat').every((h) => /Secrétariat/.test(h.from))).toBe(true);
    expect(run('réponse du secrétariat').length).toBeGreaterThan(0);
  });

  it('« avec » : expéditeur ou destinataire', () => {
    const hits = run('échanges avec le Dr Fictif');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.some((h) => h.folder === 'envoyés')).toBe(true);
  });

  it('un nom inconnu en majuscule est compris comme expéditeur, un mot courant non', () => {
    expect(parseQuery('mails de Martin', NOW, people).from).toBe('martin');
    expect(parseQuery('questions de biologie', NOW, people).from).toBeUndefined();
  });

  it('tous les exemples affichés dans l’interface donnent au moins un résultat', () => {
    for (const ex of ['mails du Dr Fictif en mars', 'amoxicilline', 'documents de stage envoyés', 'planning des gardes']) {
      expect(run(ex).length, ex).toBeGreaterThan(0);
    }
  });

  it('les mots retrouvés sont indiqués pour la mise en évidence', () => {
    expect(run('amoxicilline')[0].matched).toContain('amoxicillin');
  });
});
