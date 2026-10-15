// Bundles backend/src into a single Code.js for Apps Script, which needs plain
// top-level functions (no modules) as entry points.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const outdir = 'dist/backend';
const entryPoints = ['doGet', 'doPost', 'setupDatabase', 'installTriggers', 'grantYearlyCredits'];

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['backend/src/main.ts'],
  outfile: `${outdir}/Code.js`,
  bundle: true,
  format: 'iife',
  globalName: 'App',
  target: 'es2019',
  footer: {
    js: entryPoints.map((name) => `function ${name}(e) { return App.${name}(e); }`).join('\n'),
  },
});

copyFileSync('backend/appsscript.json', `${outdir}/appsscript.json`);
console.log(`Built ${outdir}/Code.js`);
