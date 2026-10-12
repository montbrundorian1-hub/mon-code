/**
 * Lexique médical français minimal, utilisé :
 *  1. pour repérer les noms de médicaments et termes cliniques dans un texte (garde de faits) ;
 *  2. pour proposer des corrections d'erreurs de transcription fréquentes, TOUJOURS signalées
 *     à l'utilisateur (jamais appliquées silencieusement) ;
 *  3. pour signaler les mots « proches » d'un terme médical, potentiellement mal transcrits.
 *
 * Ce lexique n'est pas exhaustif : il ne remplace pas la relecture.
 * Les termes sont des DCI (dénominations communes) et du vocabulaire hospitalier courant.
 */

export const DRUG_NAMES: readonly string[] = [
  'paracétamol', 'ibuprofène', 'kétoprofène', 'aspirine', 'tramadol', 'morphine', 'oxycodone', 'néfopam',
  'amoxicilline', 'acide clavulanique', 'augmentin', 'ceftriaxone', 'céfotaxime', 'céfazoline', 'pipéracilline',
  'tazobactam', 'vancomycine', 'gentamicine', 'amikacine', 'métronidazole', 'ciprofloxacine', 'lévofloxacine',
  'ofloxacine', 'clindamycine', 'doxycycline', 'azithromycine', 'clarithromycine', 'cotrimoxazole', 'fosfomycine',
  'nitrofurantoïne', 'méropénem', 'imipénem', 'linézolide', 'daptomycine', 'rifampicine', 'isoniazide',
  'fluconazole', 'voriconazole', 'aciclovir', 'valaciclovir', 'oseltamivir',
  'héparine', 'enoxaparine', 'tinzaparine', 'fondaparinux', 'apixaban', 'rivaroxaban', 'dabigatran',
  'warfarine', 'fluindione', 'acénocoumarol', 'clopidogrel', 'ticagrélor', 'prasugrel',
  'furosémide', 'bumétanide', 'spironolactone', 'hydrochlorothiazide', 'indapamide',
  'amlodipine', 'nicardipine', 'ramipril', 'périndopril', 'énalapril', 'lisinopril', 'losartan', 'valsartan',
  'irbésartan', 'candésartan', 'bisoprolol', 'métoprolol', 'aténolol', 'propranolol', 'nébivolol', 'carvédilol',
  'amiodarone', 'digoxine', 'flécaïnide', 'atorvastatine', 'rosuvastatine', 'simvastatine', 'pravastatine',
  'metformine', 'gliclazide', 'insuline', 'sitagliptine', 'dapagliflozine', 'empagliflozine', 'liraglutide',
  'sémaglutide', 'lévothyroxine', 'prednisone', 'prednisolone', 'méthylprednisolone', 'hydrocortisone',
  'dexaméthasone', 'oméprazole', 'ésoméprazole', 'pantoprazole', 'lansoprazole', 'métoclopramide',
  'dompéridone', 'ondansétron', 'lopéramide', 'macrogol', 'lactulose', 'salbutamol', 'terbutaline',
  'ipratropium', 'budésonide', 'fluticasone', 'montélukast', 'cétirizine', 'desloratadine', 'hydroxyzine',
  'diazépam', 'oxazépam', 'alprazolam', 'lorazépam', 'clonazépam', 'zolpidem', 'zopiclone', 'halopéridol',
  'rispéridone', 'olanzapine', 'quétiapine', 'aripiprazole', 'sertraline', 'escitalopram', 'fluoxétine',
  'paroxétine', 'venlafaxine', 'mirtazapine', 'amitriptyline', 'lithium', 'valproate', 'lévétiracétam',
  'lamotrigine', 'carbamazépine', 'gabapentine', 'prégabaline', 'méthotrexate', 'hydroxychloroquine',
  'allopurinol', 'colchicine', 'fébuxostat', 'potassium', 'magnésium', 'calcium', 'vitamine d', 'fer',
  'acide folique', 'noradrénaline', 'adrénaline', 'dobutamine', 'naloxone', 'flumazénil', 'kétamine',
  'propofol', 'midazolam', 'sufentanil', 'rémifentanil', 'lidocaïne', 'ropivacaïne', 'bupivacaïne',
];

export const CLINICAL_TERMS: readonly string[] = [
  'consultation', 'hospitalisation', 'urgences', 'réanimation', 'bilan', 'biologie', 'hémoglobine', 'plaquettes',
  'leucocytes', 'créatinine', 'clairance', 'kaliémie', 'natrémie', 'glycémie', 'hémoglobine glyquée', 'CRP',
  'procalcitonine', 'troponine', 'INR', 'TP', 'TCA', 'ionogramme', 'NFS', 'ECG', 'échographie', 'scanner',
  'IRM', 'radiographie', 'tension artérielle', 'fréquence cardiaque', 'saturation', 'température', 'fièvre',
  'dyspnée', 'douleur thoracique', 'syncope', 'insuffisance cardiaque', 'insuffisance rénale', 'pneumopathie',
  'pyélonéphrite', 'cystite', 'sepsis', 'choc septique', 'embolie pulmonaire', 'thrombose veineuse profonde',
  'fibrillation atriale', 'AVC', 'infarctus', 'diabète', 'hypertension artérielle', 'BPCO', 'asthme',
  'compte rendu', 'ordonnance', 'posologie', 'antibiothérapie', 'anticoagulation', 'kinésithérapie',
  'interne', 'externe', 'chef de clinique', 'praticien hospitalier', 'cadre de santé', 'infirmier', 'infirmière',
  'staff', 'garde', 'astreinte', 'relève', 'transmission', 'lettre de liaison', 'sortie', 'transfert',
];

/**
 * Erreurs de transcription fréquentes (observées sur Whisper en français) → forme correcte.
 * Clé : forme erronée en minuscules, sans accents normalisés.
 * Ces corrections sont TOUJOURS proposées avec un marquage « à vérifier ».
 */
export const ASR_CORRECTIONS: ReadonlyArray<{ wrong: RegExp; right: string; note: string }> = [
  { wrong: /\bla moxi[cs]+[eé]line\b/gi, right: "l'amoxicilline", note: 'Nom de médicament reconstitué' },
  { wrong: /\bl'?a?moxie?[- ]?c[eé]line\b/gi, right: "l'amoxicilline", note: 'Nom de médicament reconstitué' },
  { wrong: /\bamoxicil+ine\b/gi, right: 'amoxicilline', note: 'Orthographe du médicament' },
  { wrong: /\bpara[cs][eé]tamol\b/gi, right: 'paracétamol', note: 'Orthographe du médicament' },
  { wrong: /\bdoli\s?prane\b/gi, right: 'Doliprane', note: 'Nom commercial' },
  { wrong: /\bhéparine de bas poids moléculaire\b/gi, right: 'héparine de bas poids moléculaire', note: 'Terme' },
  { wrong: /\beno[x]?apar+ine\b/gi, right: 'enoxaparine', note: 'Orthographe du médicament' },
  { wrong: /\bfurose?mide\b/gi, right: 'furosémide', note: 'Orthographe du médicament' },
  { wrong: /\bgrame(s?)\b/gi, right: 'gramme$1', note: 'Unité (orthographe)' },
  { wrong: /\bmilligrame(s?)\b/gi, right: 'milligramme$1', note: 'Unité (orthographe)' },
  { wrong: /\bc\.?r\.?p\.?\b/gi, right: 'CRP', note: 'Sigle' },
  { wrong: /\bi\.?n\.?r\.?\b/gi, right: 'INR', note: 'Sigle' },
  { wrong: /\bn\.?f\.?s\.?\b/gi, right: 'NFS', note: 'Sigle' },
  { wrong: /\bé\.?c\.?g\.?\b/gi, right: 'ECG', note: 'Sigle' },
];

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeWord(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/[^a-z0-9]/g, '');
}

/** Distance de Levenshtein bornée (renvoie max+1 si dépassée). */
export function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

const DRUG_SET = new Map(DRUG_NAMES.map((d) => [normalizeWord(d), d]));
const SINGLE_WORD_DRUGS = DRUG_NAMES.filter((d) => !d.includes(' '));

/** Médicaments (du lexique) présents dans un texte, sous forme normalisée. */
export function findDrugs(text: string): string[] {
  const found = new Set<string>();
  const norm = ` ${stripAccents(text.toLowerCase()).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const d of DRUG_NAMES) {
    const n = ` ${stripAccents(d.toLowerCase())} `;
    if (n.trim().length >= 3 && norm.includes(n)) found.add(normalizeWord(d));
  }
  return [...found];
}

export interface UncertainTerm {
  word: string;
  suggestion: string;
  index: number;
}

/**
 * Repère les mots ressemblant à un nom de médicament sans y correspondre exactement :
 * ils sont potentiellement mal transcrits et doivent être vérifiés.
 */
export function findUncertainMedicalTerms(text: string): UncertainTerm[] {
  const out: UncertainTerm[] = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿ'-]{6,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0].replace(/^[ldLD]'/, '');
    const w = normalizeWord(raw);
    if (w.length < 6 || DRUG_SET.has(w)) continue;
    let best: { d: string; dist: number } | null = null;
    for (const d of SINGLE_WORD_DRUGS) {
      const nd = normalizeWord(d);
      if (Math.abs(nd.length - w.length) > 2 || nd[0] !== w[0]) continue;
      const dist = levenshtein(w, nd, 2);
      if (dist > 0 && dist <= 2 && (!best || dist < best.dist)) best = { d, dist };
    }
    if (best) out.push({ word: m[0], suggestion: best.d, index: m.index });
  }
  return out;
}
