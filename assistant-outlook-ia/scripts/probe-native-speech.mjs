// Sonde de la reconnaissance vocale native du navigateur en mode STRICTEMENT local
// (Web Speech API, processLocally = true). N'envoie aucun audio et ne démarre aucune reconnaissance.
//
// Usage : node scripts/probe-native-speech.mjs <chemin-du-navigateur> [libellé]
//   ex. node scripts/probe-native-speech.mjs /opt/microsoft/msedge/msedge "Edge stable"
// Option : ENABLE_EDGE_FLAG=1 active edge://flags/#edge-on-device-speech-recognition dans un profil temporaire.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [exe, label = exe] = process.argv.slice(2);
if (!exe) {
  console.error('Usage : node scripts/probe-native-speech.mjs <chemin-du-navigateur> [libellé]');
  process.exit(1);
}
const server = createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end('<!doctype html><title>sonde</title>');
});
await new Promise((r) => server.listen(4194, '127.0.0.1', r));
const profile = mkdtempSync(join(tmpdir(), 'sonde-vocale-'));
if (process.env.ENABLE_EDGE_FLAG) {
  writeFileSync(join(profile, 'Local State'), JSON.stringify({ browser: { enabled_labs_experiments: ['edge-on-device-speech-recognition@1'] } }));
}
const proxy = process.env.HTTPS_PROXY;
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: exe,
  headless: true,
  args: proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('http://localhost:4194/');
const result = await page.evaluate(async () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return { api: 'absente' };
  const out = { api: 'présente', available: typeof SR.available === 'function', processLocally: 'processLocally' in SR.prototype };
  if (!out.available) return out;
  for (const lang of ['fr-FR', 'en-US', 'de-DE', 'it-IT', 'es-ES', 'pt-PT', 'ko-KR']) {
    out[`local:${lang}`] = await SR.available({ langs: [lang], processLocally: true }).catch((e) => `erreur ${e.message}`);
  }
  out['cloud:fr-FR (jamais utilisé)'] = await SR.available({ langs: ['fr-FR'], processLocally: false }).catch((e) => `erreur ${e.message}`);
  return out;
});
console.log(`${label} — ${ctx.browser()?.version() ?? ''}`);
console.table(result);
await ctx.close();
server.close();
rmSync(profile, { recursive: true, force: true });
