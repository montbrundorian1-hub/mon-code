/**
 * Messages ENTIÈREMENT FICTIFS pour la démonstration et les tests.
 * Aucun nom, aucune adresse ni aucune situation ne correspond à une personne réelle.
 * Les domaines utilisent « exemple.test » (réservé, non routable).
 */

export interface DemoMessage {
  id: string;
  folder: 'reçus' | 'envoyés';
  from: { displayName: string; email: string };
  to: Array<{ displayName: string; email: string }>;
  subject: string;
  date: string; // ISO
  body: string;
}

export const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: 'd1',
    folder: 'reçus',
    from: { displayName: 'Dr FICTIF Alice', email: 'a.fictif@exemple.test' },
    to: [{ displayName: 'Étudiant Démo', email: 'demo@exemple.test' }],
    subject: 'Staff du jeudi — présentation de dossier',
    date: '2026-03-09T08:12:00',
    body: `Bonjour,

Pourriez-vous préparer la présentation du dossier de la chambre 14 (patient fictif) pour le staff de jeudi à 13 h 30 ?
Merci de me dire si vous avez besoin des derniers résultats de biologie.

Bien cordialement,
Dr Alice Fictif`,
  },
  {
    id: 'd2',
    folder: 'reçus',
    from: { displayName: 'Secrétariat Pédagogique (démo)', email: 'scolarite@exemple.test' },
    to: [{ displayName: 'Étudiant Démo', email: 'demo@exemple.test' }],
    subject: 'Validation de stage — documents manquants',
    date: '2026-03-02T14:40:00',
    body: `Bonjour,

Il manque votre feuille d'évaluation de stage signée pour valider la période. Pouvez-vous la déposer avant le 20 mars ?

Cordialement,
Le secrétariat pédagogique`,
  },
  {
    id: 'd3',
    folder: 'reçus',
    from: { displayName: 'Pr EXEMPLE Bruno', email: 'b.exemple@exemple.test' },
    to: [{ displayName: 'Équipe de garde (démo)', email: 'garde@exemple.test' }],
    subject: 'Planning des gardes d’avril',
    date: '2026-02-26T18:05:00',
    body: `Bonjour à tous,

Le planning des gardes d'avril est en ligne. Merci de signaler les échanges avant le 15 mars.

Pr Bruno Exemple`,
  },
  {
    id: 'd4',
    folder: 'envoyés',
    from: { displayName: 'Étudiant Démo', email: 'demo@exemple.test' },
    to: [{ displayName: 'Dr FICTIF Alice', email: 'a.fictif@exemple.test' }],
    subject: 'RE: Staff du jeudi — présentation de dossier',
    date: '2026-03-09T10:02:00',
    body: `Bonjour Docteur Fictif,

Je prépare la présentation pour jeudi. Je veux bien les derniers résultats de biologie, notamment la CRP.

Cordialement,`,
  },
  {
    id: 'd5',
    folder: 'reçus',
    from: { displayName: 'Pharmacie (démo)', email: 'pharmacie@exemple.test' },
    to: [{ displayName: 'Service de médecine (démo)', email: 'medecine@exemple.test' }],
    subject: 'Rupture de stock — amoxicilline buvable',
    date: '2026-03-05T09:30:00',
    body: `Bonjour,

Nous vous informons d'une tension d'approvisionnement sur l'amoxicilline en suspension buvable jusqu'à fin mars. Les formes comprimés restent disponibles.

La pharmacie (message fictif)`,
  },
  {
    id: 'd6',
    folder: 'envoyés',
    from: { displayName: 'Étudiant Démo', email: 'demo@exemple.test' },
    to: [{ displayName: 'Secrétariat Pédagogique (démo)', email: 'scolarite@exemple.test' }],
    subject: 'RE: Validation de stage — documents manquants',
    date: '2026-03-03T11:15:00',
    body: `Bonjour,

Je dépose la feuille d'évaluation signée jeudi au secrétariat.

Cordialement,`,
  },
  {
    id: 'd7',
    folder: 'reçus',
    from: { displayName: 'Cadre de santé (démo)', email: 'cadre@exemple.test' },
    to: [{ displayName: 'Étudiant Démo', email: 'demo@exemple.test' }],
    subject: 'Formation gestes d’urgence',
    date: '2026-01-20T16:20:00',
    body: `Bonjour,

Une session de formation aux gestes d'urgence aura lieu le 3 février de 9 h à 12 h en salle de simulation. Merci de confirmer votre présence.

Cordialement,`,
  },
  {
    id: 'd8',
    folder: 'reçus',
    from: { displayName: 'Dr FICTIF Alice', email: 'a.fictif@exemple.test' },
    to: [{ displayName: 'Étudiant Démo', email: 'demo@exemple.test' }],
    subject: 'Courrier de sortie à relire',
    date: '2026-03-11T17:45:00',
    body: `Bonjour,

Pouvez-vous relire le projet de courrier de sortie (dossier fictif n° 0000) et vérifier la posologie du paracétamol (1 g toutes les 6 heures, maximum 4 g par jour) ?

Merci,
Dr Alice Fictif`,
  },
];

/** Brouillon fictif simulé : texte existant + signature, pour tester l'insertion. */
export const DEMO_DRAFT = {
  to: [{ displayName: 'Dr FICTIF Alice', email: 'a.fictif@exemple.test' }],
  subject: 'Brouillon de démonstration',
  existingBody: '',
  signature: '--\nÉtudiant Démo\nInterne fictif — Service de démonstration',
};
