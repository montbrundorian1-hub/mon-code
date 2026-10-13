/**
 * Mesure de couverture du contenu : quelle proportion des mots porteurs de sens
 * de la source se retrouve dans le résultat ? Une couverture faible signale qu'un
 * modèle a probablement omis des informations (cas observé lors des tests réels).
 */

import { stripAccents } from './medicalLexicon';

const STOP = new Set(
  `le la les un une des de du d l au aux et ou mais donc or ni car a à en dans par pour sur sous avec sans ce cet cette ces
  je tu il elle on nous vous ils elles me te se moi toi lui leur leurs mon ma mes ton ta tes son sa ses notre nos votre vos
  qui que quoi dont où est sont été être ai as avons avez ont avait avoir fait faire plus moins très bien tout tous toute toutes
  ne pas n y si comme aussi alors ensuite déjà encore bonjour bonsoir merci cordialement madame monsieur docteur professeur
  voulais voudrais vouloir dire informer souhaite souhaitais pouvez pourriez peux pouvoir il faut faudrait c qu s j m t
  euh voilà ben bah hum`.split(/\s+/),
);

/** Racine grossière (suffixes flexionnels français), suffisante pour une comparaison robuste. */
export function stem(w: string): string {
  let s = stripAccents(w.toLowerCase());
  for (const suf of ['ements', 'ement', 'ations', 'ation', 'euses', 'euse', 'eurs', 'eur', 'ees', 'ee', 'es', 'er', 'ez', 'e', 's', 'x']) {
    if (s.length - suf.length >= 4 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  return s;
}

export function contentWords(text: string): string[] {
  return (stripAccents(text.toLowerCase()).match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
}

export function coverage(source: string, result: string): { ratio: number; missing: string[] } {
  const src = [...new Set(contentWords(source).map(stem))];
  if (!src.length) return { ratio: 1, missing: [] };
  const res = new Set(contentWords(result).map(stem));
  const missing = src.filter((w) => !res.has(w));
  return { ratio: (src.length - missing.length) / src.length, missing };
}
