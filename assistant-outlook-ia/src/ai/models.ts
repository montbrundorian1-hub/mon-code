/**
 * Catalogue des modèles open source exécutables localement dans le navigateur
 * (Transformers.js + ONNX Runtime Web).
 *
 * Les tailles sont celles des fichiers ONNX publiés sur Hugging Face (relevées le 2026-10-12),
 * arrondies, fichiers de configuration et tokenizer inclus (~ 2 à 10 Mo).
 * Les observations de qualité proviennent des tests réels décrits dans docs/COMPATIBILITY.md.
 */

export type Device = 'webgpu' | 'wasm';
export type ModelFamily = 'asr' | 'llm';

export interface ModelVariant {
  device: Device;
  /** Valeur passée à l'option `dtype` de Transformers.js. */
  dtype: string | Record<string, string>;
  /** Taille de téléchargement estimée, en octets. */
  bytes: number;
  /** Nécessite l'extension WebGPU « shader-f16 ». */
  requiresF16?: boolean;
}

export interface ModelSpec {
  id: string;
  family: ModelFamily;
  repo: string;
  label: string;
  license: string;
  /** Mémoire vive conseillée (Go). */
  minMemoryGB: number;
  /** 1 = le plus léger. Sert à l'ordre de repli. */
  weight: number;
  quality: string;
  /** Avertissement affiché avant chargement (qualité, statut expérimental…). */
  caution?: string;
  variants: ModelVariant[];
}

const MB = 1024 * 1024;

export const ASR_MODELS: ModelSpec[] = [
  {
    id: 'whisper-small',
    family: 'asr',
    repo: 'onnx-community/whisper-small',
    label: 'Whisper small (multilingue)',
    license: 'Apache-2.0 (OpenAI Whisper, MIT pour le code d’origine)',
    minMemoryGB: 4,
    weight: 3,
    quality: 'Bonne qualité en français ; doses et durées correctement transcrites lors des tests.',
    variants: [
      { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, bytes: 590 * MB },
      { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, bytes: 252 * MB },
    ],
  },
  {
    id: 'whisper-base',
    family: 'asr',
    repo: 'onnx-community/whisper-base',
    label: 'Whisper base (multilingue)',
    license: 'Apache-2.0',
    minMemoryGB: 2,
    weight: 2,
    quality: 'Qualité moyenne : erreurs sur les nombres et les noms de médicaments observées.',
    caution:
      'Lors des tests, « pendant sept jours » a été transcrit « pendant cette jour ». Relecture attentive indispensable pour tout contenu chiffré.',
    variants: [
      { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, bytes: 208 * MB },
      { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, bytes: 79 * MB },
    ],
  },
  {
    id: 'whisper-tiny',
    family: 'asr',
    repo: 'onnx-community/whisper-tiny',
    label: 'Whisper tiny (multilingue)',
    license: 'Apache-2.0',
    minMemoryGB: 1,
    weight: 1,
    quality: 'Qualité faible : à réserver aux postes très anciens.',
    caution: 'Erreurs fréquentes sur les médicaments et les doses. Ne convient pas à un contenu clinique.',
    variants: [
      { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, bytes: 122 * MB },
      { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, bytes: 43 * MB },
    ],
  },
  {
    id: 'whisper-large-v3-turbo',
    family: 'asr',
    repo: 'onnx-community/whisper-large-v3-turbo',
    label: 'Whisper large-v3 turbo (multilingue)',
    license: 'MIT',
    minMemoryGB: 8,
    weight: 4,
    quality: 'Meilleure qualité attendue ; WebGPU avec shader-f16 obligatoire.',
    caution: 'Non testé dans l’environnement de développement (pas de GPU). Téléchargement important.',
    variants: [
      {
        device: 'webgpu',
        dtype: { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
        bytes: 570 * MB,
        requiresF16: true,
      },
    ],
  },
];

/**
 * Modèles de rédaction. Tous sont marqués EXPÉRIMENTAUX : les tests réels montrent que les
 * modèles de moins de 2 milliards de paramètres peuvent omettre ou modifier des informations.
 * Leur sortie est systématiquement contrôlée (garde de faits + couverture) et l'utilisateur
 * garde la version sans IA.
 */
export const LLM_MODELS: ModelSpec[] = [
  {
    id: 'qwen2.5-1.5b',
    family: 'llm',
    repo: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: 'Qwen2.5 1.5B Instruct',
    license: 'Apache-2.0',
    minMemoryGB: 8,
    weight: 3,
    quality: 'Le plus fluide en français parmi les modèles testés, mais a parfois ajouté des détails.',
    caution: 'Expérimental. Lent sans carte graphique compatible WebGPU.',
    variants: [
      { device: 'webgpu', dtype: 'q4f16', bytes: 1230 * MB, requiresF16: true },
      { device: 'webgpu', dtype: 'q4', bytes: 1795 * MB },
      { device: 'wasm', dtype: 'q4', bytes: 1795 * MB },
    ],
  },
  {
    id: 'qwen3-0.6b',
    family: 'llm',
    repo: 'onnx-community/Qwen3-0.6B-ONNX',
    label: 'Qwen3 0.6B',
    license: 'Apache-2.0',
    minMemoryGB: 4,
    weight: 2,
    quality: 'Correct sur des corrections simples ; peut supprimer des titres (« docteur »).',
    caution: 'Expérimental.',
    variants: [
      { device: 'webgpu', dtype: 'q4f16', bytes: 575 * MB, requiresF16: true },
      { device: 'webgpu', dtype: 'q4', bytes: 925 * MB },
      { device: 'wasm', dtype: 'q8', bytes: 623 * MB },
    ],
  },
  {
    id: 'granite-4.0-350m',
    family: 'llm',
    repo: 'onnx-community/granite-4.0-350m-ONNX-web',
    label: 'Granite 4.0 350M',
    license: 'Apache-2.0',
    minMemoryGB: 2,
    weight: 1,
    quality: 'Très léger ; a parfois supprimé une grande partie du message lors des tests.',
    caution: 'Expérimental, qualité limitée.',
    variants: [
      { device: 'webgpu', dtype: 'q4f16', bytes: 355 * MB, requiresF16: true },
      { device: 'webgpu', dtype: 'q4', bytes: 580 * MB },
      { device: 'wasm', dtype: 'q4', bytes: 580 * MB },
    ],
  },
];

export function allModels(): ModelSpec[] {
  return [...ASR_MODELS, ...LLM_MODELS];
}

export function findModel(id: string): ModelSpec | undefined {
  return allModels().find((m) => m.id === id);
}

export interface Capabilities {
  webgpu: boolean;
  shaderF16: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  /** navigator.deviceMemory (plafonné à 8 par le navigateur), null si inconnu. */
  memoryGB: number | null;
  cores: number | null;
}

/** Choisit la variante compatible la plus adaptée pour un modèle donné. */
export function pickVariant(spec: ModelSpec, caps: Capabilities): ModelVariant | null {
  for (const v of spec.variants) {
    if (v.device === 'webgpu' && !caps.webgpu) continue;
    if (v.requiresF16 && !caps.shaderF16) continue;
    if (v.device === 'wasm' && !(caps.wasm && caps.wasmSimd)) continue;
    return v;
  }
  return null;
}

export type Tier = 'gpu' | 'cpu-confort' | 'cpu-modeste' | 'insuffisant';

export function hardwareTier(caps: Capabilities): Tier {
  if (!caps.wasm || !caps.wasmSimd) return caps.webgpu ? 'gpu' : 'insuffisant';
  if (caps.webgpu) return 'gpu';
  const mem = caps.memoryGB ?? 4;
  const cores = caps.cores ?? 4;
  if (mem >= 8 && cores >= 4) return 'cpu-confort';
  if (mem >= 2) return 'cpu-modeste';
  return 'insuffisant';
}

/**
 * Liste ordonnée des modèles recommandés pour une famille, du préféré au plus léger.
 * Le premier élément est la recommandation ; les suivants servent au repli automatique proposé.
 */
export function recommend(family: ModelFamily, caps: Capabilities): Array<{ spec: ModelSpec; variant: ModelVariant }> {
  const tier = hardwareTier(caps);
  const mem = caps.memoryGB ?? 4;
  const pool = (family === 'asr' ? ASR_MODELS : LLM_MODELS)
    .map((spec) => ({ spec, variant: pickVariant(spec, caps) }))
    .filter((x): x is { spec: ModelSpec; variant: ModelVariant } => !!x.variant)
    .filter((x) => x.spec.minMemoryGB <= Math.max(mem, 2) || tier === 'gpu');

  let preferredOrder: string[];
  if (family === 'asr') {
    preferredOrder =
      tier === 'gpu'
        ? ['whisper-small', 'whisper-base', 'whisper-tiny', 'whisper-large-v3-turbo']
        : tier === 'cpu-confort'
          ? ['whisper-small', 'whisper-base', 'whisper-tiny']
          : ['whisper-base', 'whisper-tiny', 'whisper-small'];
  } else {
    preferredOrder =
      tier === 'gpu'
        ? ['qwen2.5-1.5b', 'qwen3-0.6b', 'granite-4.0-350m']
        : tier === 'cpu-confort'
          ? ['qwen3-0.6b', 'granite-4.0-350m', 'qwen2.5-1.5b']
          : ['granite-4.0-350m', 'qwen3-0.6b'];
  }
  const rank = (id: string) => {
    const i = preferredOrder.indexOf(id);
    return i < 0 ? 99 : i;
  };
  return pool.filter((x) => rank(x.spec.id) < 99).sort((a, b) => rank(a.spec.id) - rank(b.spec.id));
}

/** Modèle de repli plus léger que celui qui vient d'échouer. */
export function lighterThan(id: string, family: ModelFamily, caps: Capabilities) {
  const failed = findModel(id);
  if (!failed) return null;
  return (
    recommend(family, caps)
      .filter((x) => x.spec.weight < failed.weight)
      .sort((a, b) => b.spec.weight - a.spec.weight)[0] ?? null
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1).replace('.', ',')} Go`;
  return `${Math.round(bytes / MB)} Mo`;
}
