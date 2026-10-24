// Builds the static site into dist/: the game itself (public/) plus the few
// library files it loads. GitHub Pages serves dist/ as-is; there is no game
// server, the hosting player's browser runs each shift.
// Usage: npm run build

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const NM = path.join(ROOT, 'node_modules');

const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};

fs.rmSync(OUT, { recursive: true, force: true });
copy(path.join(ROOT, 'public'), OUT);

copy(path.join(NM, 'three', 'build', 'three.module.min.js'), path.join(OUT, 'vendor', 'three.module.min.js'));
// the three.js add-ons the game imports (each only imports 'three' itself)
for (const f of ['geometries/RoundedBoxGeometry.js', 'environments/RoomEnvironment.js', 'utils/BufferGeometryUtils.js']) {
  copy(path.join(NM, 'three', 'examples', 'jsm', f), path.join(OUT, 'vendor', 'three-addons', f));
}
copy(path.join(NM, 'peerjs', 'dist', 'peerjs.min.js'), path.join(OUT, 'vendor', 'peerjs.min.js'));

// fonts: Bebas Neue (the big HUD words), Special Elite (titles), VT323
// (the dispatcher) and Inter (everything else), latin subset only
const fonts = [
  ['bebas-neue', 'latin-400.css', ['bebas-neue-latin-400-normal']],
  ['special-elite', 'latin-400.css', ['special-elite-latin-400-normal']],
  ['inter', 'latin-400.css', ['inter-latin-400-normal']],
  ['inter', 'latin-600.css', ['inter-latin-600-normal']],
  ['vt323', 'latin-400.css', ['vt323-latin-400-normal']],
];
for (const [pkg, css, files] of fonts) {
  const dir = path.join(NM, '@fontsource', pkg);
  copy(path.join(dir, css), path.join(OUT, 'vendor', pkg, css));
  for (const f of files) for (const ext of ['.woff2', '.woff']) copy(path.join(dir, 'files', f + ext), path.join(OUT, 'vendor', pkg, 'files', f + ext));
}

// Make browsers fetch the new code after every deploy: GitHub Pages lets
// them cache files for a while, and a friend still running yesterday's
// scripts can't play with someone running today's. Every module import and
// the page's script and stylesheet get ?v=<hash of this build's code>.
const hash = crypto.createHash('sha1');
const walk = (dir, fn) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, fn);
    else fn(p);
  }
};
walk(path.join(OUT, 'js'), (p) => hash.update(fs.readFileSync(p)));
hash.update(fs.readFileSync(path.join(OUT, 'css', 'style.css')));
const v = hash.digest('hex').slice(0, 10);
walk(path.join(OUT, 'js'), (p) => {
  if (!p.endsWith('.js')) return;
  const src = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, src.replace(/(from\s+['"])(\.{1,2}\/[^'"]+\.js)(['"])/g, `$1$2?v=${v}$3`));
});
const htmlPath = path.join(OUT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const stamped = html.replace('src="js/main.js"', `src="js/main.js?v=${v}"`).replace('href="css/style.css"', `href="css/style.css?v=${v}"`);
if (stamped === html) throw new Error('index.html no longer links js/main.js and css/style.css');
fs.writeFileSync(htmlPath, stamped);

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let files = 0, bytes = 0;
const count = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) count(p);
    else { files++; bytes += fs.statSync(p).size; }
  }
};
count(OUT);
console.log(`Static build written to dist/ (${files} files, ${(bytes / 1e6).toFixed(1)} MB)`);
