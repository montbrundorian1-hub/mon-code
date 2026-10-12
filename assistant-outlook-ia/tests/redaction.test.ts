// Cas 18–20 : reformulation française fictive, vocabulaire médical, conservation des dates et doses.
import { describe, expect, it } from 'vitest';
import { aiRejection, Assistant, type TextGenerationProvider } from '../src/ai/assistant';
import { applyDictatedPunctuation, classicRewrite, removeHesitations, removeRepetitions, splitMail } from '../src/ai/classic';
import { applyClassicCommand, parseCommand } from '../src/ai/commands';
import { coverage } from '../src/ai/coverage';
import { diffStats, diffWords } from '../src/ai/diff';
import { compareFacts, extractFacts, properNouns, wordsToDigits } from '../src/ai/factGuard';
import { findUncertainMedicalTerms } from '../src/ai/medicalLexicon';
import { cleanLlmOutput } from '../src/ai/prompts';
import { resolveStyle } from '../src/ai/style';

const DR = { recipients: [{ displayName: 'Dr MARTIN Paul' }], formality: 'auto' as const };

/** Fournisseur IA simulé renvoyant un texte prédéfini. */
const fakeAi = (out: string): TextGenerationProvider => ({ id: 'fake', label: 'IA simulée', isReady: () => true, generate: async () => out });

describe('cas 18 — reformulation d’un mail français fictif (mode classique)', () => {
  it('structure formule d’appel / corps / politesse et nettoie la dictée', () => {
    const r = classicRewrite(
      'euh bonjour à tous euh je voulais dire que la réunion de service de jeudi est euh est décalée à 14 h 30 en salle B euh voilà merci de prévenir les internes',
      DR,
    );
    expect(r.text).toBe(
      'Bonjour à tous,\n\nJe voulais dire que la réunion de service de jeudi est décalée à 14 h 30 en salle B. Merci de prévenir les internes.\n\nBien cordialement,'.replace('14 h', '14 h'),
    );
  });

  it('ajoute une formule adaptée au destinataire (titre Dr)', () => {
    const r = classicRewrite('je vous confirme la réunion de jeudi', DR);
    expect(r.text.startsWith('Bonjour Docteur Martin,')).toBe(true);
    expect(r.text.endsWith('Bien cordialement,')).toBe(true);
    expect(r.notes.join(' ')).toMatch(/Formule d’appel ajoutée/);
  });

  it('ponctuation dictée, questions et typographie française', () => {
    expect(applyDictatedPunctuation('bonjour virgule pouvez vous venir point d\'interrogation nouveau paragraphe merci')).toBe('bonjour, pouvez vous venir ?\n\nmerci');
    const r = classicRewrite('je confirme la sortie demain. pouvez vous envoyer le compte rendu', { recipients: [], formality: 'auto' });
    expect(r.text).toContain('Pouvez-vous envoyer le compte rendu ?');
    // « vous pouvez vous … » (forme pronominale) ne doit pas devenir « vous pouvez-vous »
    expect(classicRewrite('vous pouvez vous adresser au secrétariat', { recipients: [], formality: 'auto' }).text).not.toMatch(/pouvez-vous/);
  });

  it('supprime hésitations et répétitions sans casser « nous nous »', () => {
    expect(removeHesitations('euh je pense hum que oui').replace(/\s+/g, ' ').trim()).toBe('je pense que oui');
    expect(removeRepetitions('le le patient est est sorti')).toBe('le patient est sorti');
    expect(removeRepetitions('nous nous sommes vus')).toBe('nous nous sommes vus');
  });

  it('tutoiement : ton familier', () => {
    expect(resolveStyle({ recipients: [{ displayName: 'Jean Dupont' }], formality: 'auto' }, 'tu peux venir').formality).toBe('familier');
    expect(resolveStyle({ recipients: [{ displayName: 'a' }, { displayName: 'b' }, { displayName: 'c' }], formality: 'auto' }).greeting).toBe('Bonjour à tous,');
  });

  it('découpe une formule de politesse finale', () => {
    const p = splitMail('Bonjour, je confirme. Merci d’avance, bonne journée !');
    expect(p.greeting).toBe('Bonjour,');
    expect(p.closing).toMatch(/Merci/);
  });
});

describe('cas 19 — vocabulaire médical fictif', () => {
  it('corrige une erreur de transcription connue ET la signale', () => {
    const r = classicRewrite('nous avons débuté la moxiceline à un grame', DR);
    expect(r.text).toContain("l'amoxicilline");
    expect(r.text).toContain('gramme');
    expect(r.corrections.map((c) => c.to)).toEqual(expect.arrayContaining(["l'amoxicilline", 'gramme']));
  });

  it('repère un nom de médicament incertain sans le corriger silencieusement', () => {
    const u = findUncertainMedicalTerms('prescription de furosémid et de paracetamole');
    expect(u.map((x) => x.suggestion)).toEqual(expect.arrayContaining(['furosémide', 'paracétamol']));
  });

  it('les termes corrects ne sont pas signalés', () => {
    expect(findUncertainMedicalTerms('amoxicilline et paracétamol')).toEqual([]);
  });
});

describe('cas 20 — conservation des dates et dosages', () => {
  const src = "Madame Dupont vue le 12 mars. Amoxicilline 1 g trois fois par jour pendant sept jours. Contrôle à 14 h 30.";

  it('extrait doses, durées, dates, heures, médicaments et noms', () => {
    const keys = extractFacts(src).map((f) => `${f.kind}:${f.key}`);
    expect(keys).toEqual(expect.arrayContaining(['date:12/3', 'dose:1 g', 'dose:3x/jour', 'durée:7 jour', 'heure:14h30', 'médicament:amoxicilline', 'nom:dupont']));
    expect(wordsToDigits('sept jours')).toBe('7 jours');
  });

  it('détecte une dose modifiée ou une information ajoutée', () => {
    const r = compareFacts(src, src.replace('1 g', '2 g').replace('12 mars', '13 mars'));
    expect(r.ok).toBe(false);
    expect(r.missing.map((f) => f.key)).toEqual(expect.arrayContaining(['1 g', '12/3']));
    expect(r.added.map((f) => f.key)).toEqual(expect.arrayContaining(['2 g', '13/3']));
  });

  it('accepte les changements de graphie (« sept jours » → « 7 jours »)', () => {
    expect(compareFacts('pendant sept jours, un gramme', 'pendant 7 jours, 1 g').ok).toBe(true);
  });

  it('écarte une proposition IA qui modifie une dose ; conserve la version classique', async () => {
    const a = new Assistant(fakeAi('Bonjour Docteur Martin,\n\nNous avons débuté l’amoxicilline à 2 g trois fois par jour.\n\nBien cordialement,'));
    const r = await a.draftFromDictation('nous avons débuté l’amoxicilline à 1 g trois fois par jour', DR, { useAi: true });
    expect(r.engine).toBe('classique');
    expect(r.rejectionReason).toMatch(/1 g/);
    expect(r.text).toContain('1 g'.replace(' ', ' '));
  });

  it('écarte une proposition IA qui ajoute un nom (signature inventée)', () => {
    expect(aiRejection('Bonjour,\n\nLe staff est jeudi.', 'Bonjour,\n\nLe staff est jeudi.\n\nDocteur Leroy', 0.7)).toMatch(/Leroy/);
  });

  it('écarte une proposition IA qui supprime une grande partie du contenu', () => {
    const ref = 'Bonjour à tous,\n\nLa réunion de service de jeudi est décalée en salle B. Merci de prévenir les internes et les externes du service.\n\nCordialement,';
    expect(aiRejection(ref, 'Merci de prévenir les internes.', 0.75)).toMatch(/couverture/);
  });

  it('retient une proposition IA fidèle', async () => {
    const a = new Assistant(fakeAi('Bonjour Docteur Martin,\n\nJe vous confirme que le staff aura lieu jeudi à 14 h 30.\n\nBien cordialement,'));
    const r = await a.draftFromDictation('je vous confirme que le staff a lieu jeudi à 14 h 30', DR, { useAi: true });
    expect(r.engine).toBe('ia');
    expect(r.validation.facts.ok).toBe(true);
    expect(r.classicText).not.toBe('');
  });
});

describe('Commandes de modification', () => {
  const mail = 'Bonjour à tous,\n\nJe voulais vous dire que, comme vous le savez peut-être déjà, la réunion est décalée à 14 h 30. Merci de bien vouloir prévenir les internes dès que possible.\n\nCordialement,';

  it('reconnaît les commandes écrites ou vocales', () => {
    expect(parseCommand('Plus court !').kind).toBe('shorter');
    expect(parseCommand('rends le plus formel').kind).toBe('more-formal');
    expect(parseCommand('transforme en liste à puces').kind).toBe('to-list');
    expect(parseCommand('ajoute cette précision : la salle est la B').arg).toBe('la salle est la B');
    expect(parseCommand('remplace jeudi par vendredi')).toMatchObject({ kind: 'replace', arg: 'jeudi', arg2: 'vendredi' });
    expect(parseCommand('annule').kind).toBe('undo');
    expect(parseCommand('arrête l’écoute'.replace('’', "'")).kind).toBe('stop-listening');
    expect(parseCommand('reformule la deuxième phrase avec plus de tact').kind).toBe('free');
  });

  it('« plus court » retire les formules superflues sans perdre les faits', () => {
    const r = applyClassicCommand(mail, parseCommand('plus court'));
    expect(r.applied).toBe(true);
    expect(r.text.length).toBeLessThan(mail.length);
    expect(compareFacts(mail, r.text).ok).toBe(true);
  });

  it('« plus formel », « liste », « ajoute », « remplace », « supprime la dernière phrase »', () => {
    expect(applyClassicCommand('Salut,\n\nOk pour demain.\n\nBises', parseCommand('plus formel')).text).toBe('Bonjour,\n\nd’accord pour demain.\n\nBien cordialement,');
    const list = applyClassicCommand('Bonjour,\n\nIl faut l’ordonnance, le compte rendu et le rendez-vous.\n\nCordialement,', parseCommand('en liste'));
    expect(list.text).toContain('- L’ordonnance');
    expect(list.text).toContain('- Le rendez-vous');
    expect(applyClassicCommand(mail, parseCommand('ajoute : la salle est la B')).text).toContain('La salle est la B.\n\nCordialement,');
    expect(applyClassicCommand(mail, parseCommand('remplace jeudi par vendredi')).applied).toBe(false); // « jeudi » absent ici
    expect(applyClassicCommand(mail, parseCommand('remplace 14 h 30 par 15 h')).text).toContain('15 h');
    expect(applyClassicCommand(mail, parseCommand('supprime la dernière phrase')).text).not.toContain('internes');
  });

  it('consigne libre sans IA : explication claire', () => {
    const r = applyClassicCommand(mail, parseCommand('reformule avec plus de tact'));
    expect(r.applied).toBe(false);
    expect(r.message).toMatch(/modèle IA local/);
  });
});

describe('Comparaison et nettoyage', () => {
  it('diff mot à mot', () => {
    const ops = diffWords('le patient est sorti', 'le patient est rentré');
    expect(ops).toEqual([
      { type: 'equal', text: 'le patient est ' },
      { type: 'delete', text: 'sorti' },
      { type: 'insert', text: 'rentré' },
    ]);
    expect(diffStats(ops)).toEqual({ inserted: 1, deleted: 1 });
  });

  it('couverture du contenu', () => {
    expect(coverage('réunion décalée salle B internes', 'réunion décalée salle B internes').ratio).toBe(1);
    expect(coverage('réunion décalée salle B internes prévenir', 'merci').ratio).toBeLessThan(0.3);
  });

  it('nettoie objet, signature fictive et balises de réflexion des sorties IA', () => {
    expect(cleanLlmOutput('<think>…</think>Objet : Test\n\nBonjour,\n\nTexte.\n\nCordialement,\n[Votre nom]')).toBe('Bonjour,\n\nTexte.\n\nCordialement,');
  });

  it('noms propres : ignore les débuts de phrase et mots courants', () => {
    expect(properNouns('Bonjour Docteur Martin. Nous avons vu Madame DUPONT jeudi.')).toEqual(['Martin', 'Dupont']);
  });
});
