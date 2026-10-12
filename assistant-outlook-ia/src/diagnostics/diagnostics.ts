/**
 * Diagnostic de compatibilité NON INTRUSIF.
 *
 * - Ne lit aucun message, n'ouvre pas le micro (sauf test explicite séparé).
 * - N'invente aucune valeur : une information indisponible est affichée « inconnue ».
 * - Le rapport copiable ne contient que des informations techniques.
 */

import { APP_VERSION } from '../config';
import { hardwareTier, type Capabilities } from '../ai/models';
import { policyAllowsMicrophone } from '../audio/micCapture';
import { getBlockedCount, summarizeGuard } from '../security/networkGuard';
import { nativeLocalSpeechStatus } from '../transcription/engines';
import type { BootResult } from '../outlook/bootstrap';

/** Hôtes bloqués par la CSP depuis le démarrage (noms d'hôte uniquement). */
const cspBlocked = new Set<string>();
export function recordCspViolation(host: string): void {
  if (host) cspBlocked.add(host.slice(0, 80));
}

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info' | 'unknown';

export interface Check {
  id: string;
  group: 'Outlook' | 'Microphone' | 'IA locale' | 'Sécurité' | 'Navigateur';
  label: string;
  status: CheckStatus;
  value: string;
  detail?: string;
}

/** Octets d'un module WASM minimal utilisant une instruction SIMD (v128). */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export async function detectCapabilities(nav: Navigator = navigator): Promise<Capabilities & { gpuInfo: string | null }> {
  const wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  let wasmSimd = false;
  try {
    wasmSimd = wasm && WebAssembly.validate(SIMD_PROBE);
  } catch {
    wasmSimd = false;
  }
  let webgpu = false;
  let shaderF16 = false;
  let gpuInfo: string | null = null;
  const gpu = (nav as Navigator & { gpu?: { requestAdapter(): Promise<any> } }).gpu; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (gpu) {
    try {
      const adapter = await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (adapter) {
        webgpu = true;
        shaderF16 = !!(adapter as { features?: Set<string> }).features?.has('shader-f16');
        const info = (adapter as { info?: { vendor?: string; architecture?: string } }).info;
        gpuInfo = info ? [info.vendor, info.architecture].filter(Boolean).join(' ') || null : null;
      }
    } catch {
      webgpu = false;
    }
  }
  const memoryGB = (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  const cores = nav.hardwareConcurrency || null;
  return { webgpu, shaderF16, wasm, wasmSimd, memoryGB, cores, gpuInfo };
}

export async function runDiagnostics(boot: BootResult): Promise<Check[]> {
  const checks: Check[] = [];
  const info = boot.host.info();

  // --- Outlook ---
  checks.push({
    id: 'office-script',
    group: 'Outlook',
    label: 'Bibliothèque Office.js',
    status: boot.officeScriptLoaded ? 'ok' : 'warn',
    value: boot.officeScriptLoaded ? 'chargée' : 'non chargée',
    detail: boot.officeScriptLoaded ? undefined : 'Hors Outlook ou CDN Microsoft inaccessible : mode démonstration.',
  });
  checks.push({
    id: 'office-host',
    group: 'Outlook',
    label: 'Hôte détecté',
    status: info.kind === 'office' ? 'ok' : 'info',
    value: info.kind === 'office' ? `Outlook (${info.hostName ?? 'nom inconnu'})` : 'Démonstration (Outlook simulé)',
    detail: boot.error ? `Initialisation : ${boot.error}` : boot.readyMs != null ? `Office.onReady en ${boot.readyMs} ms` : undefined,
  });
  if (info.kind === 'office') {
    checks.push({ id: 'office-version', group: 'Outlook', label: 'Version du client', status: info.hostVersion ? 'info' : 'unknown', value: info.hostVersion ?? 'inconnue' });
    checks.push({ id: 'office-platform', group: 'Outlook', label: 'Plateforme', status: info.platform ? 'info' : 'unknown', value: info.platform ?? 'inconnue' });
    const sets = Object.entries(info.mailboxSets).filter(([, v]) => v).map(([k]) => k);
    const max = sets.length ? sets[sets.length - 1] : null;
    checks.push({
      id: 'mailbox-sets',
      group: 'Outlook',
      label: 'Jeux d’API Mailbox',
      status: !max ? 'fail' : info.mailboxSets['1.3'] ? 'ok' : 'warn',
      value: max ? `1.1 → ${max}` : 'aucun',
      detail: !info.mailboxSets['1.3'] ? 'La lecture du message (body.getAsync) exige Mailbox 1.3.' : 'Exchange on-premises 2016/2019/SE : jusqu’à 1.5 attendu.',
    });
    checks.push({
      id: 'mode',
      group: 'Outlook',
      label: 'Mode de l’élément',
      status: info.mode === 'none' ? 'warn' : 'ok',
      value: info.mode === 'compose' ? 'Rédaction' : info.mode === 'read' ? 'Lecture' : 'Aucun élément',
    });
    for (const [k, v] of Object.entries(info.methods)) {
      checks.push({ id: `m-${k}`, group: 'Outlook', label: k, status: v ? 'ok' : 'info', value: v ? 'disponible' : 'absente' });
    }
    checks.push({
      id: 'dialog',
      group: 'Outlook',
      label: 'Fenêtre de dialogue (Dialog API)',
      status: info.dialogApi ? 'ok' : 'warn',
      value: info.dialogApi ? 'disponible' : 'indisponible',
      detail: 'Sert à ouvrir la dictée hors du panneau si celui-ci bloque le micro.',
    });
  }

  // --- Navigateur ---
  checks.push({ id: 'secure', group: 'Navigateur', label: 'Contexte sécurisé (HTTPS)', status: window.isSecureContext ? 'ok' : 'fail', value: window.isSecureContext ? 'oui' : 'non' });
  checks.push({ id: 'iframe', group: 'Navigateur', label: 'Affiché dans un cadre (iframe)', status: 'info', value: window.self !== window.top ? 'oui (panneau Outlook)' : 'non (fenêtre autonome)' });
  const ua = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string; version: string }> } }).userAgentData;
  const edge = ua?.brands?.find((b) => /Edge/i.test(b.brand));
  checks.push({
    id: 'browser',
    group: 'Navigateur',
    label: 'Navigateur',
    status: edge ? 'ok' : 'info',
    value: edge ? `Microsoft Edge ${edge.version}` : ua?.brands?.map((b) => `${b.brand} ${b.version}`).join(', ') || 'inconnu',
  });
  let storageOk: boolean | null = null;
  try {
    const k = '__aoia_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    storageOk = true;
  } catch {
    storageOk = false;
  }
  checks.push({
    id: 'storage',
    group: 'Navigateur',
    label: 'Stockage des préférences',
    status: storageOk ? 'ok' : 'warn',
    value: storageOk ? 'disponible' : 'bloqué',
    detail: 'Seules des préférences non sensibles y sont enregistrées.',
  });

  // --- Microphone ---
  const policy = policyAllowsMicrophone();
  checks.push({
    id: 'mic-api',
    group: 'Microphone',
    label: 'API de capture audio',
    status: typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'ok' : 'fail',
    value: typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'présente' : 'absente',
  });
  checks.push({
    id: 'mic-policy',
    group: 'Microphone',
    label: 'Micro autorisé par la page hôte',
    status: policy === true ? 'ok' : policy === false ? 'fail' : 'unknown',
    value: policy === true ? 'oui' : policy === false ? 'non (bloqué par le cadre Outlook)' : 'inconnu',
    detail: policy === false ? 'Utiliser la dictée en fenêtre séparée.' : undefined,
  });
  try {
    const perm = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    checks.push({
      id: 'mic-perm',
      group: 'Microphone',
      label: 'Permission micro du site',
      status: perm?.state === 'granted' ? 'ok' : perm?.state === 'denied' ? 'fail' : 'info',
      value: perm?.state === 'granted' ? 'accordée' : perm?.state === 'denied' ? 'refusée' : 'sera demandée',
    });
  } catch {
    checks.push({ id: 'mic-perm', group: 'Microphone', label: 'Permission micro du site', status: 'unknown', value: 'inconnue' });
  }
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    const n = devices?.filter((d) => d.kind === 'audioinput').length ?? 0;
    checks.push({ id: 'mic-devices', group: 'Microphone', label: 'Entrées audio visibles', status: n > 0 ? 'ok' : 'warn', value: String(n), detail: 'Le nombre exact n’est visible qu’après autorisation.' });
  } catch {
    checks.push({ id: 'mic-devices', group: 'Microphone', label: 'Entrées audio visibles', status: 'unknown', value: 'inconnu' });
  }

  // --- IA locale ---
  const caps = await detectCapabilities();
  checks.push({ id: 'wasm', group: 'IA locale', label: 'WebAssembly', status: caps.wasm ? 'ok' : 'fail', value: caps.wasm ? 'oui' : 'non' });
  checks.push({ id: 'simd', group: 'IA locale', label: 'WebAssembly SIMD', status: caps.wasmSimd ? 'ok' : 'warn', value: caps.wasmSimd ? 'oui' : 'non' });
  checks.push({
    id: 'threads',
    group: 'IA locale',
    label: 'Multithread WASM (isolation)',
    status: 'info',
    value: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ? 'oui' : 'non (1 thread)',
    detail: 'Un panneau Outlook ne peut généralement pas être isolé : calcul sur un seul cœur.',
  });
  checks.push({
    id: 'webgpu',
    group: 'IA locale',
    label: 'WebGPU',
    status: caps.webgpu ? 'ok' : 'info',
    value: caps.webgpu ? `oui${caps.gpuInfo ? ` (${caps.gpuInfo})` : ''}${caps.shaderF16 ? ', shader-f16' : ''}` : 'non disponible',
  });
  checks.push({ id: 'memory', group: 'IA locale', label: 'Mémoire déclarée', status: caps.memoryGB ? 'info' : 'unknown', value: caps.memoryGB ? `≥ ${caps.memoryGB} Go (valeur plafonnée par le navigateur)` : 'inconnue' });
  checks.push({ id: 'cores', group: 'IA locale', label: 'Cœurs logiques', status: caps.cores ? 'info' : 'unknown', value: caps.cores ? String(caps.cores) : 'inconnu' });
  const tier = hardwareTier(caps);
  checks.push({
    id: 'tier',
    group: 'IA locale',
    label: 'Profil matériel estimé',
    status: tier === 'insuffisant' ? 'fail' : tier === 'cpu-modeste' ? 'warn' : 'ok',
    value: { gpu: 'Carte graphique (WebGPU)', 'cpu-confort': 'Processeur confortable', 'cpu-modeste': 'Processeur modeste', insuffisant: 'Insuffisant pour l’IA locale' }[tier],
  });
  try {
    const est = await navigator.storage?.estimate();
    if (est?.quota) {
      const freeGB = ((est.quota - (est.usage ?? 0)) / 1024 ** 3).toFixed(1).replace('.', ',');
      checks.push({ id: 'quota', group: 'IA locale', label: 'Espace de cache disponible (estimé)', status: 'info', value: `${freeGB} Go` });
    } else {
      checks.push({ id: 'quota', group: 'IA locale', label: 'Espace de cache disponible', status: 'unknown', value: 'inconnu' });
    }
  } catch {
    checks.push({ id: 'quota', group: 'IA locale', label: 'Espace de cache disponible', status: 'unknown', value: 'inconnu' });
  }
  const native = await nativeLocalSpeechStatus();
  checks.push({
    id: 'native-sr',
    group: 'IA locale',
    label: 'Reconnaissance vocale native locale (fr-FR)',
    status: native === 'available' ? 'ok' : 'info',
    value: { available: 'disponible', downloadable: 'téléchargeable', 'unavailable-fr': 'français non pris en charge', 'api-absent': 'API absente' }[native],
    detail: 'La reconnaissance « cloud » d’Edge n’est jamais utilisée.',
  });

  // --- Sécurité ---
  const blocked = getBlockedCount();
  checks.push({
    id: 'guard',
    group: 'Sécurité',
    label: 'Requêtes bloquées par le garde réseau',
    status: blocked ? 'warn' : 'ok',
    value: String(blocked),
    detail: summarizeGuard().map((s) => `${s.host} : ${s.allowed} autorisée(s), ${s.blocked} bloquée(s)`).join(' ; ') || 'aucune requête externe',
  });
  checks.push({
    id: 'csp',
    group: 'Sécurité',
    label: 'Ressources bloquées par la CSP',
    status: cspBlocked.size ? 'info' : 'ok',
    value: cspBlocked.size ? [...cspBlocked].join(', ') : 'aucune',
    detail: cspBlocked.size
      ? 'Normal pour la télémétrie d’Office.js. Si Outlook ne détecte pas le panneau, transmettre cette liste (docs/COMPATIBILITY.md).'
      : undefined,
  });
  checks.push({ id: 'version', group: 'Sécurité', label: 'Version de l’application', status: 'info', value: APP_VERSION });
  return checks;
}

/** Rapport technique copiable : aucune donnée de message, de dictée ou d'identité. */
export function technicalReport(checks: Check[]): string {
  const lines = [`Assistant Outlook IA ${APP_VERSION} — diagnostic technique (aucune donnée personnelle)`, `Date : ${new Date().toISOString().slice(0, 16)}`];
  for (const c of checks) lines.push(`[${c.status.toUpperCase()}] ${c.group} / ${c.label} : ${c.value}`);
  return lines.join('\n');
}
