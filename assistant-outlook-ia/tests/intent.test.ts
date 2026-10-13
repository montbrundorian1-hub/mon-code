// Constat du test réel (2026-10-13) : « écris un mail au secrétariat pour dire que… » était recopié
// tel quel dans le mail. Le mode classique comprend désormais les consignes courantes.
import { describe, expect, it } from 'vitest';
import { Assistant } from '../src/ai/assistant';
import { extractFacts } from '../src/ai/factGuard';
import { greetingFor, parseWritingIntent } from '../src/ai/intent';

const body = (s: string) => parseWritingIntent(s)?.body;

describe('Consignes d’écriture comprises sans IA', () => {
  it('« écris un mail à X pour dire / prévenir / confirmer / rappeler … »', () => {
    expect(body('écrire un mail au secrétariat pour dire que je serai absent demain')).toBe('Je vous informe que je serai absent demain.');
    expect(body('écris un mail au secrétariat pour leur dire que je serai absent demain matin')).toBe('Je vous informe que je serai absent demain matin.');
    expect(body('fais un mail pour le cadre pour prévenir que je serai en retard')).toBe('Je tenais à vous prévenir que je serai en retard.');
    expect(body('envoie un message au secrétariat pour confirmer le rendez-vous de jeudi à 14 h')).toBe('Je vous confirme le rendez-vous de jeudi à 14 h.');
    expect(body('écris un mail aux infirmières pour leur rappeler que la formation commence à 9 h')).toBe('Je vous rappelle que la formation commence à 9 h.');
    expect(body('écris un mail au secrétariat : je serai absent demain')).toBe('Je serai absent demain.');
  });

  it('demandes reformulées poliment, sans conjugaison hasardeuse', () => {
    expect(body("rédige un mail à Dr Martin pour lui demander s'il peut me remplacer jeudi")).toBe('Pourriez-vous me remplacer jeudi ?');
    expect(body('peux-tu écrire un mail au secrétariat pour demander les plannings de garde')).toBe('Pourriez-vous me communiquer les plannings de garde ?');
    expect(body('écris un mail au secrétariat pour demander si le staff est maintenu')).toBe('Pourriez-vous me dire si le staff est maintenu ?');
    expect(body('écris un mail au secrétariat pour demander quand aura lieu le staff')).toBe('Pourriez-vous me dire quand aura lieu le staff ?');
    expect(body("écris un mail au Pr Exemple pour demander s'il est disponible mardi")).toBe('Seriez-vous disponible mardi ?');
    expect(body('écris un mail au secrétariat pour demander un rendez-vous')).toBe("Serait-il possible d'avoir un rendez-vous ?");
    expect(body("demande au service de cardiologie de m'envoyer le compte rendu")).toBe("Pourriez-vous m'envoyer le compte rendu ?");
  });

  it('plusieurs demandes dans une même consigne', () => {
    const i = parseWritingIntent("écris un mail au secrétariat pour dire que je serai absent demain et demander qu'on décale mes consultations");
    expect(i?.body).toBe("Je vous informe que je serai absent demain. Serait-il possible qu'on décale mes consultations ?");
    expect(i?.summary).toBe('informer + demander — destinataire : secrétariat');
  });

  it('consignes directes : « dis au… », « préviens le… », « remercie le… »', () => {
    expect(body('dis au secrétariat que je serai absent')).toBe('Je vous informe que je serai absent.');
    expect(body('préviens le secrétariat que je serai absent lundi')).toBe('Je tenais à vous prévenir que je serai absent lundi.');
    expect(body("informe l'équipe que la réunion est annulée")).toBe('Je vous informe que la réunion est annulée.');
    expect(body('remercie le Pr Exemple pour son aide')).toBe('Je vous remercie pour votre aide.');
    expect(body("écris un mail à l'équipe pour remercier de leur aide")).toBe('Je vous remercie de votre aide.');
    expect(body('écris un mail à Julie pour lui dire merci')).toBe('Je tenais à vous dire merci.');
  });

  it('un vrai contenu de mail n’est jamais pris pour une consigne', () => {
    expect(parseWritingIntent('Bonjour, je vous écris pour vous dire que je serai absent demain')).toBeNull();
    expect(parseWritingIntent('bonjour docteur martin je vous confirme le staff de jeudi à 14 h 30')).toBeNull();
    expect(parseWritingIntent('dites-moi si vous êtes disponible jeudi')).toBeNull();
    expect(parseWritingIntent('écris un mail')).toBeNull();
  });

  it('formule d’appel déduite du destinataire nommé', () => {
    expect(greetingFor('docteur martin')).toEqual({ greeting: 'Bonjour Docteur Martin,', formal: true });
    expect(greetingFor('Pr EXEMPLE')).toEqual({ greeting: 'Bonjour Professeur Exemple,', formal: true });
    expect(greetingFor('madame dupont')?.greeting).toBe('Bonjour Madame Dupont,');
    expect(greetingFor('équipe')?.greeting).toBe('Bonjour à tous,');
    expect(greetingFor('secrétariat')?.greeting).toBe('Bonjour,');
    expect(greetingFor('Julie')?.greeting).toBe('Bonjour Julie,');
  });
});

describe('Rédaction complète à partir d’une consigne', () => {
  const a = new Assistant(null);
  const style = { recipients: [], formality: 'auto' as const };

  it('le mail ne recopie plus la consigne', async () => {
    const o = await a.draftFromDictation('écrire un mail au secrétariat pour dire que je serai absent demain', style);
    expect(o.text).toBe('Bonjour,\n\nJe vous informe que je serai absent demain.\n\nCordialement,');
    expect(o.notes[0]).toBe('Consigne comprise : informer — destinataire : secrétariat.');
    expect(o.validation.warnings).toEqual([]);
  });

  it('destinataire titré : ton formel, faits conservés (heure)', async () => {
    const o = await a.draftFromDictation("Écris un mail au docteur martin, pour lui demander s'il peut me remplacer jeudi à 14 h 30.", style);
    expect(o.text).toBe('Bonjour Docteur Martin,\n\nPourriez-vous me remplacer jeudi à 14\u00A0h\u00A030\u00A0?\n\nBien cordialement,');
    expect(o.validation.warnings).toEqual([]);
  });

  it('dictée avec hésitations et ponctuation dictée', async () => {
    const o = await a.draftFromDictation("euh écris un mail au secrétariat pour dire que je serai absent demain virgule et demander qu'on décale mes consultations", style);
    expect(o.text).toContain("Je vous informe que je serai absent demain. Serait-il possible qu'on décale mes consultations\u00A0?");
  });

  it('réponse : « dis-lui que… » devient une réponse directe', async () => {
    const r = await a.reply('Bonjour, êtes-vous disponible jeudi ?', "dis-lui que je suis d'accord pour jeudi", { recipients: [{ displayName: 'Dr FICTIF Alice' }], formality: 'auto', isReply: true });
    expect(r.text).toBe("Bonjour Docteur Fictif,\n\nJe suis d'accord pour jeudi.\n\nBien cordialement,");
  });
});

describe('Garde de faits', () => {
  it('« un mail » n’est pas la date « 1 mai »', () => {
    expect(extractFacts('envoie un mail au secrétariat').some((f) => f.kind === 'date')).toBe(false);
    expect(extractFacts('rendez-vous le 1 mai').some((f) => f.kind === 'date')).toBe(true);
  });
});
