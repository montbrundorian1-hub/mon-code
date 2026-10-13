// Cas 28 : recherche simulée sur des messages fictifs ; recherche réelle désactivée ;
// dans Outlook, question traduite en recherche à coller dans le webmail.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeMail, autoReplySkeleton } from '../src/ai/analyze';
import { searchView } from '../src/components/searchView';
import { DEMO_MESSAGES } from '../src/mock/messages';
import { DemoSearchProvider, ExchangeSearchProvider, outlookSearchQuery, parseQuery, searchMessages, SERVICE_SENDERS } from '../src/search/search';
import type { AppContext } from '../src/ui/context';

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

describe('Recherche dans Outlook : question traduite en recherche à coller (test réel du 2026-10-13)', () => {
  const TODAY = new Date('2026-10-13T12:00:00');
  const outlook = (text: string) => outlookSearchQuery(parseQuery(text, TODAY, SERVICE_SENDERS));

  it('expéditeur et mois : filtres de la recherche avancée, dates sans ambiguïté jour/mois', () => {
    expect(outlook('mails du Dr Martin en mars')).toEqual({
      precise: 'from:Martin received:2026-03-01..2026-03-31',
      simple: 'Martin',
      tips: ['Période comprise : du 01/03/2026 au 31/03/2026.'],
    });
    expect(outlook('mails du Dr Fictif en mars sur le staff').precise).toBe('from:Fictif staff received:2026-03-01..2026-03-31');
    expect(outlook('Mails du Pr. Dupont au mois d’avril').precise).toBe('from:Dupont received:2026-04-01..2026-04-30');
    expect(outlook('mails de mars 2025').precise).toBe('received:2025-03-01..2025-03-31');
    expect(outlook('hier')).toMatchObject({ precise: 'received:2026-10-12', simple: '', tips: ['Période comprise : le 12/10/2026.'] });
  });

  it('services connus même en minuscules, accents conservés', () => {
    expect(outlook('messages du secrétariat cette semaine').precise).toBe('from:secrétariat received:2026-10-06..2026-10-13');
    expect(outlook('recherche les mails de la pharmacie').precise).toBe('from:pharmacie');
    expect(parseQuery('réunion pédagogique', TODAY).words).toEqual(['réunion', 'pédagogique']);
  });

  it('« à propos » n’est pas un destinataire « Pr opos » ; toutes les occurrences de « de » sont examinées', () => {
    const q = parseQuery('réponse du secrétariat à propos du congé', TODAY, SERVICE_SENDERS);
    expect(q.to).toBeUndefined();
    expect(outlook('réponse du secrétariat à propos du congé').precise).toBe('from:secrétariat congé');
    expect(outlook('documents de stage du Dr Martin').precise).toBe('from:Martin documents stage');
  });

  it('noms composés, apostrophe typographique, titres enchaînés', () => {
    expect(outlook("mails de Dupont-Moreau sur l'évaluation").precise).toBe('from:Dupont-Moreau évaluation');
    expect(outlook('mails d’Hélène sur la garde').precise).toBe('from:Hélène garde');
    const q = parseQuery('échanges avec le Dr Fictif', TODAY);
    expect(q.participant).toBe('fictif');
    expect(q.words).toEqual([]);
  });

  it('dossier : « envoyés à » = mes envois, « envoyés par » = messages reçus', () => {
    const sent = outlook('mails envoyés à Martin');
    expect(sent.precise).toBe('to:Martin');
    expect(sent.tips.join(' ')).toMatch(/Éléments envoyés/);
    expect(parseQuery('envoyés par mes collègues', TODAY).folder).toBeUndefined();
  });

  it('question sans critère : rien à chercher', () => {
    expect(outlook('les mails')).toEqual({ precise: '', simple: '', tips: [] });
  });

  describe('vue « Rechercher » dans Outlook', () => {
    const officeCtx = { host: { info: () => ({ kind: 'office' }) } } as unknown as AppContext;
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('prépare la recherche et la copie ; aucune donnée fictive ni lecture de la boîte', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const view = searchView(officeCtx);
      document.body.append(view);
      expect(view.textContent).not.toMatch(/fictif/i);
      expect(view.textContent).toMatch(/ReadWriteMailbox/);
      const example = [...view.querySelectorAll<HTMLButtonElement>('.examples .chip-btn')].find((b) => b.textContent === 'mails du Dr Martin en mars')!;
      example.click();
      const box = view.querySelector('.query-box')!;
      expect(box.textContent).toMatch(/^from:Martin received:\d{4}-03-01\.\.\d{4}-03-31$/);
      expect(view.textContent).toMatch(/from: = expéditeur · received: = date de réception/);
      view.querySelector<HTMLButtonElement>('#btn-copy-search')!.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(writeText).toHaveBeenCalledWith(box.textContent);
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('saisie libre : Entrée prépare la recherche, saisie vide ne fait rien', () => {
      const view = searchView(officeCtx);
      document.body.append(view);
      const input = view.querySelector<HTMLInputElement>('.search-input')!;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(view.querySelector('.query-box')).toBeNull();
      input.value = 'planning des gardes';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(view.querySelector('.query-box')?.textContent).toBe('planning gardes');
      input.value = 'les mails';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(view.textContent).toMatch(/Indiquez au moins un mot/);
    });
  });
});
