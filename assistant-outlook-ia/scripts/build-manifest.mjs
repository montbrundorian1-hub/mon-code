// Génère manifest.xml (production) et manifest.dev.xml (développement) à partir de manifest.template.xml.
//   npm run manifest -- https://votre-compte.github.io/mon-code/
// Sans argument : URL de production par défaut ci-dessous.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PROD_URL = 'https://montbrundorian1-hub.github.io/mon-code/';
const PROD_ID = '736b1163-acd0-4555-b0fc-839f9492a4a0';
const DEV_ID = '3c185fc4-77de-4f2d-b313-3db02a5ba78a';
// Version du MANIFEST (≥ 1.0 exigé). À n'incrémenter que si le manifest change (URL, permissions,
// boutons) : les mises à jour du site web ne nécessitent pas de réimporter le manifest.
const MANIFEST_VERSION = '1.0.0.0';

function normalize(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    console.error(`URL invalide : ${url}`);
    process.exit(1);
  }
  if (u.protocol !== 'https:') {
    console.error('Outlook exige une URL HTTPS.');
    process.exit(1);
  }
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = '';
  u.hash = '';
  return u.href;
}

function render(baseUrl, id, name) {
  const tpl = readFileSync(join(root, 'manifest.template.xml'), 'utf8');
  return tpl
    .replace(/<!--\s*Manifest XML classique[\s\S]*?-->\n/, '')
    .replaceAll('{{BASE_URL}}', baseUrl)
    .replaceAll('{{ORIGIN}}', new URL(baseUrl).origin)
    .replaceAll('{{ID}}', id)
    .replaceAll('{{NAME}}', name)
    .replaceAll('{{VERSION}}', MANIFEST_VERSION);
}

const prodUrl = normalize(process.argv[2] ?? process.env.ADDIN_URL ?? DEFAULT_PROD_URL);
writeFileSync(join(root, 'manifest.xml'), render(prodUrl, PROD_ID, 'Assistant Outlook IA'));
writeFileSync(join(root, 'manifest.dev.xml'), render('https://localhost:3000/', DEV_ID, 'Assistant Outlook IA (DEV)'));
console.log(`manifest.xml      → ${prodUrl}`);
console.log('manifest.dev.xml  → https://localhost:3000/');
