// Test de bout en bout dans un VRAI navigateur Chromium (mode démonstration, données fictives).
//
// - Le micro est simulé par Chromium à partir d'un fichier audio SYNTHÉTIQUE fictif
//   (tests/fixtures/dictee-synthetique-fictive.wav) : le chemin getUserMedia → AudioWorklet →
//   segmentation → Whisper (WASM) est réellement exécuté.
// - Le modèle Whisper est réellement téléchargé depuis huggingface.co puis exécuté localement.
// - Toutes les requêtes réseau sont enregistrées et vérifiées (hôtes, méthodes, corps).
//
// Usage : npm run build && npm run e2e -- [--asr whisper-small|whisper-base|whisper-tiny] [--llm qwen3-0.6b] [--shots dossier]
// Variables : CHROMIUM_PATH (défaut : Chromium Playwright préinstallé), HTTPS_PROXY (si nécessaire).

import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const ASR = opt('asr', 'whisper-small');
const LLM = opt('llm', '');
const SHOTS = opt('shots', join(root, 'e2e-results'));
const WAV = join(root, 'tests', 'fixtures', 'dictee-synthetique-fictive.wav');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ absent : lancez « npm run build » avant « npm run e2e ».');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(dist, p);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4180, '127.0.0.1', r));
const BASE = 'http://localhost:4180/';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: [
    ...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1'] : []),
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});
// ignoreHTTPSErrors : uniquement à cause du proxy TLS de l'environnement de test.
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 }, locale: 'fr-FR' });
await context.grantPermissions(['microphone'], { origin: BASE.slice(0, -1) });

const requests = [];
context.on('request', (r) => {
  const u = new URL(r.url());
  requests.push({ host: u.host, protocol: u.protocol, method: r.method(), hasBody: !!r.postDataBuffer(), path: u.pathname.slice(0, 80) });
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`   [console.${m.type()}] ${m.text().slice(0, 200)}`);
});
page.on('worker', (w) => {
  w.on('console', (m) => m.type() === 'error' && console.log(`   [worker.error] ${m.text().slice(0, 200)}`));
});

const shot = async (name) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const t0 = Date.now();
try {
  // 1. Démarrage
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached', timeout: 60000 });
  check('Démarrage de l’application', true, `${Date.now() - t0} ms`);
  const badge = await page.locator('.badges .badge').first().textContent();
  check('Mode démonstration détecté hors Outlook', /Démo/.test(badge ?? ''), badge ?? '');
  await shot('01-accueil');

  // 2. Chargement guidé du modèle de transcription (consentement obligatoire)
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await page.waitForSelector('.model-panel .model-option', { timeout: 30000 });
  const label = { 'whisper-small': 'Whisper small', 'whisper-base': 'Whisper base', 'whisper-tiny': 'Whisper tiny' }[ASR];
  await page.locator('.model-panel .model-option', { hasText: label }).locator('input').check();
  const loadBtn = page.locator('.model-panel button.btn-primary');
  check('Téléchargement impossible sans consentement', await loadBtn.isDisabled());
  await page.locator('.model-panel .consent input').check();
  await shot('02-consentement');
  const tLoad = Date.now();
  await loadBtn.click();
  await page.waitForSelector('.model-panel .progress', { timeout: 30000 }).catch(() => undefined);
  await shot('03-telechargement');
  await page.waitForFunction(() => !document.querySelector('.view-dicter .model-panel') || !!document.querySelector('.alert-error'), null, { timeout: 15 * 60000 });
  const loadErr = await page.locator('.view-dicter .alert-error').count();
  check(`Chargement du modèle ${ASR} (WASM)`, loadErr === 0, `${Math.round((Date.now() - tLoad) / 1000)} s`);
  if (loadErr) throw new Error(await page.locator('.alert-error').first().textContent());

  // 3. Dictée avec micro simulé (audio synthétique fictif)
  const tDict = Date.now();
  await page.locator('.mic-button').click();
  await page.waitForSelector('.mic-badge:not([hidden])', { timeout: 10000 });
  check('Indicateur « Micro actif » visible', true);
  await page.waitForTimeout(4000);
  await shot('04-dictee-en-cours');
  // L'audio dure ~19 s ; on attend la fin puis on arrête.
  await page.waitForTimeout(17000);
  await page.locator('#btn-stop').click();
  await page.waitForSelector('textarea[aria-label="Transcription originale (modifiable)"]', { timeout: 10 * 60000 });
  check('Micro libéré après arrêt', (await page.locator('.mic-badge:not([hidden])').count()) === 0);
  const transcript = await page.locator('textarea[aria-label="Transcription originale (modifiable)"]').inputValue();
  writeFileSync(join(SHOTS, 'transcription.txt'), transcript);
  const segs = await page.locator('.seg.final').count();
  check('Transcription locale obtenue', transcript.length > 40, `${segs} segment(s), ${Math.round((Date.now() - tDict) / 1000)} s : « ${transcript} »`);
  check('Doses conservées par la transcription (1 g, 3 fois, 7 jours)', /1\s?g|un gramme/i.test(transcript) && /(3|trois) fois/i.test(transcript) && /(7|sept) jours/i.test(transcript));
  await shot('05-transcription');

  // 4. Génération du mail (mode classique ou IA)
  await page.locator('#btn-generate').click();
  await page.waitForSelector('textarea[aria-label="Version rédigée (modifiable)"]', { timeout: 120000 });
  const mail = await page.locator('textarea[aria-label="Version rédigée (modifiable)"]').inputValue();
  writeFileSync(join(SHOTS, 'mail.txt'), mail);
  check('Mail rédigé (mode classique)', /^Bonjour/.test(mail) && /cordialement|Merci/i.test(mail), mail.replace(/\n/g, ' ⏎ ').slice(0, 300));
  const validation = await page.locator('.validation').innerText();
  check('Panneau de vérification affiché', validation.length > 10, validation.replace(/\n/g, ' | ').slice(0, 300));
  await shot('06-mail-redige');
  await page.getByRole('tab', { name: 'Différences' }).click();
  check('Comparaison original / rédigé', (await page.locator('.diff-body').count()) === 1);
  await shot('07-differences');
  await page.getByRole('tab', { name: 'Version rédigée' }).click();

  // 5. Commande de modification
  await page.locator('.cmd-input').first().fill('transforme en liste');
  await page.locator('.cmd-input').first().press('Enter');
  await page.waitForTimeout(500);
  const listed = await page.locator('textarea[aria-label="Version rédigée (modifiable)"]').inputValue();
  check('Commande « transforme en liste »', /\n- /.test(listed));
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.waitForTimeout(300);
  check('Annuler restaure la version précédente', (await page.locator('textarea[aria-label="Version rédigée (modifiable)"]').inputValue()) === mail);

  // 6. Insertion dans le brouillon simulé
  await page.locator('#btn-insert-draft').click();
  await page.waitForTimeout(500);
  await page.locator('.demo-draft summary').click();
  const draft = await page.locator('.demo-draft pre').innerText();
  check('Insertion dans le brouillon simulé, signature conservée', draft.includes(mail.split('\n')[0]) && draft.includes('Étudiant Démo'));
  await shot('08-insertion');

  // 7. Rédaction IA locale (optionnelle)
  if (LLM) {
    await page.locator('.tab', { hasText: 'Modèles' }).click();
    const panel = page.locator('.model-panel').nth(1);
    await panel.locator('.model-option', { hasText: { 'qwen3-0.6b': 'Qwen3 0.6B', 'qwen2.5-1.5b': 'Qwen2.5 1.5B', 'granite-4.0-350m': 'Granite' }[LLM] }).locator('input').check();
    await panel.locator('.consent input').check();
    const tL = Date.now();
    await panel.locator('button.btn-primary').click();
    await page.waitForFunction(() => /IA locale prête|échec/.test(document.querySelector('.badges')?.textContent ?? ''), null, { timeout: 30 * 60000 });
    const ok = /IA locale prête/.test(await page.locator('.badges').innerText());
    check(`Chargement du modèle de rédaction ${LLM}`, ok, `${Math.round((Date.now() - tL) / 1000)} s`);
    if (ok) {
      await page.locator('.tab', { hasText: 'Rédiger' }).click();
      await page.locator('.view-rediger label.inline input[type=checkbox]').check();
      const tG = Date.now();
      await page.locator('#btn-redact').click();
      await page.waitForFunction(() => document.querySelector('.view-rediger .busy')?.hasAttribute('hidden'), null, { timeout: 30 * 60000 });
      const aiMail = await page.locator('textarea[aria-label="Version rédigée (modifiable)"]').inputValue();
      const engine = await page.locator('.validation').innerText();
      writeFileSync(join(SHOTS, 'mail-ia.txt'), `${aiMail}\n\n---\n${engine}`);
      check('Rédaction avec IA locale', aiMail.length > 20, `${Math.round((Date.now() - tG) / 1000)} s — ${/écartée/.test(engine) ? 'proposition IA écartée par la garde de faits' : 'proposition IA retenue'}`);
      await shot('09-mail-ia');
    }
  }

  // 8. Recherche fictive
  await page.locator('.tab', { hasText: 'Rechercher' }).click();
  await page.locator('input[type=search]').fill('amoxicilline');
  await page.locator('input[type=search]').press('Enter');
  await page.waitForSelector('.result', { timeout: 5000 });
  check('Recherche sur messages fictifs', (await page.locator('.result').count()) >= 1);
  await shot('10-recherche');

  // 9. Réponse à un message fictif
  await page.locator('.tab', { hasText: 'Répondre' }).click();
  await page.locator('#btn-analyze').click();
  await page.waitForSelector('#btn-reply');
  await page.locator('textarea[aria-label="Intentions de réponse"]').fill('oui pour jeudi, je prépare la présentation et je veux bien les résultats de biologie');
  await page.locator('#btn-reply').click();
  await page.waitForSelector('textarea[aria-label="Réponse (modifiable)"]', { timeout: 15 * 60000 });
  const reply = await page.locator('textarea[aria-label="Réponse (modifiable)"]').inputValue();
  check('Réponse guidée à un message fictif', /^Bonjour/.test(reply) && /jeudi/i.test(reply), reply.replace(/\n/g, ' ⏎ ').slice(0, 200));
  await shot('11-reponse');

  // 10. Diagnostic
  await page.locator('.tab', { hasText: 'Diagnostic' }).click();
  await page.waitForSelector('.check', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const diag = await page.locator('.view-diagnostic').innerText();
  writeFileSync(join(SHOTS, 'diagnostic.txt'), diag);
  check('Page de diagnostic', /WebAssembly/.test(diag));
  await shot('12-diagnostic');

  // 11. Aucune donnée utilisateur persistée
  const storage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    localValues: Object.values(localStorage).join(' '),
    session: Object.keys(sessionStorage),
    idb: (await indexedDB.databases?.())?.map((d) => d.name) ?? [],
    caches: await caches.keys(),
  }));
  const leaked = /amoxicilline|Dupont|Martin|gramme/i.test(storage.localValues);
  check('Aucun contenu utilisateur dans localStorage/sessionStorage/IndexedDB', !leaked && storage.session.length === 0 && storage.idb.length === 0, JSON.stringify({ local: storage.local, session: storage.session, idb: storage.idb, caches: storage.caches }));
} catch (e) {
  check('Exécution du scénario', false, e instanceof Error ? e.message : String(e));
  await shot('erreur').catch(() => undefined);
} finally {
  // 12. Vérification du trafic réseau
  const external = requests.filter((r) => !['localhost:4180'].includes(r.host) && !r.protocol.startsWith('blob') && !r.protocol.startsWith('data'));
  const hosts = [...new Set(external.map((r) => r.host))];
  const allowed = (h) => h === 'appsforoffice.microsoft.com' || h === 'huggingface.co' || h.endsWith('.huggingface.co') || h.endsWith('.hf.co');
  const badHosts = hosts.filter((h) => !allowed(h));
  const withBody = external.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' || r.hasBody);
  check('Hôtes externes contactés uniquement dans la liste blanche', badHosts.length === 0, hosts.join(', ') || 'aucun');
  check('Aucune requête externe avec envoi de données (POST/corps)', withBody.length === 0, withBody.map((r) => `${r.method} ${r.host}`).join(', '));
  writeFileSync(join(SHOTS, 'requetes-externes.json'), JSON.stringify(external, null, 1));
  writeFileSync(join(SHOTS, 'resultats.json'), JSON.stringify({ date: new Date().toISOString(), asr: ASR, llm: LLM || null, chromium: browser.version(), results }, null, 1));
  await browser.close();
  server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies. Captures et journaux : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}
