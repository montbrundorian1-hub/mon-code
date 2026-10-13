import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// HTTPS local facultatif (pour charger le complément de développement dans Outlook) :
// certificats générés par « npx office-addin-dev-certs install ».
function devHttps(enabled: boolean) {
  if (!enabled) return undefined;
  const dir = join(homedir(), '.office-addin-dev-certs');
  const key = join(dir, 'localhost.key');
  const cert = join(dir, 'localhost.crt');
  if (!existsSync(key) || !existsSync(cert)) {
    console.warn('Certificats de développement introuvables : lancez « npx office-addin-dev-certs install ».');
    return undefined;
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export default defineConfig(({ mode }) => ({
  // Chemins relatifs : le site fonctionne quel que soit le sous-dossier d'hébergement.
  base: './',
  server: { port: 3000, strictPort: true, https: devHttps(mode === 'https') },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // Noms de fichiers versionnés par empreinte : les mises à jour invalident le cache navigateur.
    assetsDir: 'assets',
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
}));
