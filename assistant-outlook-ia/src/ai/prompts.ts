/**
 * Consignes envoyées au modèle de langage LOCAL.
 *
 * Stratégie retenue après tests réels : le modèle ne rédige pas « à partir de rien ».
 * Il reçoit un brouillon déjà nettoyé et structuré par le mode classique, et n'est chargé
 * que de corrections légères ou d'une modification précise. Cela réduit fortement
 * les inventions et omissions observées avec des petits modèles.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const RULES = `Garde le même sens et TOUTES les informations : noms, dates, heures, nombres, doses, unités, médicaments.
N'ajoute rien : ni objet, ni signature, ni nom, ni phrase nouvelle, ni texte entre crochets.
Ne donne aucun avis médical et ne prends aucune décision à la place de l'auteur.
Réponds uniquement par le courriel, sans commentaire.`;

const POLISH_SYSTEM = `Tu corriges des courriels professionnels rédigés en français à partir d'une dictée.
Corrige uniquement l'orthographe, la grammaire, la ponctuation et la fluidité des phrases.
Garde la même structure (formule d'appel, paragraphes, formule de politesse).
${RULES}`;

// Exemple sans nom propre : un exemple nominatif a été recopié par un modèle lors des tests.
const EXAMPLE_IN = `Bonjour,

Je vous écrie pour vous dire que le patient de la chambre 12 a eu son scanner hier et que les résultat sont dans le dossier. Il faudrait le revoir le 4 juin.

Cordialement,`;
const EXAMPLE_OUT = `Bonjour,

Je vous écris pour vous informer que le patient de la chambre 12 a passé son scanner hier et que les résultats sont dans le dossier. Il faudrait le revoir le 4 juin.

Cordialement,`;

export function polishMessages(draft: string, toneHint?: string): ChatMessage[] {
  return [
    { role: 'system', content: POLISH_SYSTEM + (toneHint ? `\nTon souhaité : ${toneHint}.` : '') },
    { role: 'user', content: `Courriel à corriger :\n${EXAMPLE_IN}` },
    { role: 'assistant', content: EXAMPLE_OUT },
    { role: 'user', content: `Courriel à corriger :\n${draft}` },
  ];
}

export function commandMessages(draft: string, instruction: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Tu modifies un courriel professionnel en français selon la consigne de l'utilisateur, et seulement selon elle.
${RULES}`,
    },
    { role: 'user', content: `Consigne : ${instruction}\n\nCourriel :\n${draft}` },
  ];
}

export function replyMessages(receivedMail: string, intentions: string, greeting: string, closing: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Tu aides à rédiger la RÉPONSE à un courriel professionnel, en français.
La réponse doit exprimer uniquement les intentions données par l'utilisateur.
N'invente aucune décision, aucun rendez-vous, aucun résultat, aucune information médicale.
Si une information manque, écris [à compléter].
Commence par « ${greeting} » et termine par « ${closing} ».
Réponds uniquement par le texte de la réponse.`,
    },
    {
      role: 'user',
      content: `Courriel reçu :\n"""\n${receivedMail}\n"""\n\nIntentions de réponse de l'utilisateur :\n${intentions}`,
    },
  ];
}

export function summaryMessages(receivedMail: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Résume en français, en 3 puces maximum, le courriel fourni : objet de la demande, questions posées, échéances explicites.
N'invente rien. Si aucune échéance n'est indiquée, ne mentionne pas d'échéance.`,
    },
    { role: 'user', content: receivedMail },
  ];
}

export function chatMessages(history: ChatMessage[], context: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Tu es un assistant de rédaction de courriels professionnels en français, intégré à Outlook.
Tu aides à formuler, corriger et structurer des messages. Tu ne donnes pas d'avis médical.
Tu ne prétends jamais avoir envoyé, lu ou recherché un courriel.
Contexte (brouillon actuel ou message reçu) :
"""
${context}
"""`,
    },
    ...history.slice(-8),
  ];
}

/** Nettoie les sorties typiques des petits modèles (objet, signature fictive, commentaires). */
export function cleanLlmOutput(text: string): string {
  let s = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[a-z]*\n?|```/g, '').trim();
  s = s.replace(/^(?:voici[^\n]*:\s*\n|courriel(?: corrigé)?\s*:\s*\n)/i, '');
  s = s.replace(/^objet\s*:[^\n]*\n+/i, '');
  const lines = s.split('\n').filter((l) => !/^\s*\[(?:votre|ton|nom|prénom|signature)[^\]]*\]\s*$/i.test(l));
  s = lines.join('\n');
  s = s.replace(/\n+(?:n'hésitez pas à me (?:donner|faire part)[^\n]*|j'espère que cette (?:version|correction)[^\n]*)$/i, '');
  return s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
