/**
 * Nettoyage des transcriptions Whisper : suppression des « hallucinations » connues
 * (phrases issues des corpus de sous-titres, produites sur du silence ou du bruit).
 */

/** Phrases « hallucinées » par Whisper sur du silence ou du bruit (corpus de sous-titres). */
const HALLUCINATIONS: RegExp[] = [
  /sous-titr(es|age)\s+(réalisés?|fait|par).*$/i,
  /amara\.org/i,
  /merci d'avoir regardé/i,
  /abonnez-vous/i,
  /^\W*merci\.?\W*$/i,
  /société radio-canada/i,
  /^\W*(\.|…)+\W*$/,
];

export function cleanTranscript(t: string): string {
  let s = t.trim();
  for (const re of HALLUCINATIONS) if (re.test(s)) s = s.replace(re, '').trim();
  return s;
}
