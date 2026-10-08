// Genera tutte le icone (macOS .icns, Windows .ico, Android adaptive, logo in-app)
// a partire da un unico disegno vettoriale.  Uso: npm run icons
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p) => join(root, ...p);

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4E46F5"/>
      <stop offset=".42" stop-color="#9A45FF"/>
      <stop offset=".78" stop-color="#FF5A92"/>
      <stop offset="1" stop-color="#FFA44A"/>
    </linearGradient>
    <radialGradient id="shine" cx=".22" cy=".12" r=".9">
      <stop offset="0" stop-color="#fff" stop-opacity=".34"/>
      <stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="play" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5B49F7"/>
      <stop offset="1" stop-color="#F0559F"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#F1ECFF"/>
    </linearGradient>
    <filter id="lift" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#2B0B6B" flood-opacity=".38"/>
    </filter>
    <filter id="plate" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000" flood-opacity=".28"/>
    </filter>
  </defs>`;

// Tre diapositive impilate + triangolo "play": il soggetto dell'icona.
const glyph = (scale = 1) => `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -472)">
    <rect x="312" y="200" width="400" height="300" rx="50" fill="#fff" opacity=".28"/>
    <rect x="272" y="268" width="480" height="340" rx="58" fill="#fff" opacity=".55"/>
    <g filter="url(#lift)">
      <rect x="232" y="345" width="560" height="400" rx="66" fill="url(#card)"/>
    </g>
    <path d="M474 474 L474 616 L598 545 Z" fill="url(#play)" stroke="url(#play)"
          stroke-width="34" stroke-linejoin="round"/>
  </g>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${defs}${body}</svg>`;

const plate = (x, size, rx, extra = '') => `
  <g ${extra}>
    <rect x="${x}" y="${x}" width="${size}" height="${size}" rx="${rx}" fill="url(#bg)"/>
    <rect x="${x}" y="${x}" width="${size}" height="${size}" rx="${rx}" fill="url(#shine)"/>
  </g>`;

const variants = {
  // macOS: piastra 824px centrata con ombra, come da linee guida Apple
  mac: svg(plate(100, 824, 186, 'filter="url(#plate)"') + glyph(0.8)),
  // Windows / logo: piastra a tutto campo con angoli arrotondati
  tile: svg(plate(0, 1024, 228) + glyph(1)),
  // Android adaptive: sfondo pieno + soggetto dentro la zona sicura
  androidBg: svg(`<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#shine)"/>`),
  androidFg: svg(glyph(0.6)),
  androidRound: svg(`<circle cx="512" cy="512" r="512" fill="url(#bg)"/><circle cx="512" cy="512" r="512" fill="url(#shine)"/>` + glyph(0.74)),
};

const png = (name, size) => sharp(Buffer.from(variants[name]), { density: 72 }).resize(size, size).png().toBuffer();
const save = async (file, name, size) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await png(name, size));
};

// --- sorgenti vettoriali + PNG principali
mkdirSync(out('build'), { recursive: true });
writeFileSync(out('build', 'icon.svg'), variants.tile);
writeFileSync(out('app', 'assets', 'logo.svg'), variants.tile);
await save(out('build', 'icon.png'), 'mac', 1024);
await save(out('app', 'assets', 'icon-256.png'), 'tile', 256);

// --- macOS .icns
if (process.platform === 'darwin') {
  const set = out('build', 'icon.iconset');
  rmSync(set, { recursive: true, force: true });
  for (const s of [16, 32, 128, 256, 512]) {
    await save(join(set, `icon_${s}x${s}.png`), 'mac', s);
    await save(join(set, `icon_${s}x${s}@2x.png`), 'mac', s * 2);
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', out('build', 'icon.icns')]);
  rmSync(set, { recursive: true, force: true });
}

// --- Windows .ico (PNG incapsulati)
{
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const imgs = await Promise.all(sizes.map((s) => png('tile', s)));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(s === 256 ? 0 : s, o); head.writeUInt8(s === 256 ? 0 : s, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(imgs[i].length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += imgs[i].length;
  });
  writeFileSync(out('build', 'icon.ico'), Buffer.concat([head, ...imgs]));
}

// --- Android (solo se il progetto nativo esiste)
const res = out('android', 'app', 'src', 'main', 'res');
if (existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = join(res, `mipmap-${d}`);
    await save(join(dir, 'ic_launcher.png'), 'tile', 48 * k);
    await save(join(dir, 'ic_launcher_round.png'), 'androidRound', 48 * k);
    await save(join(dir, 'ic_launcher_foreground.png'), 'androidFg', 108 * k);
    await save(join(dir, 'ic_launcher_background.png'), 'androidBg', 108 * k);
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });
  writeFileSync(join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive);
  writeFileSync(join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive);
  await save(out('build', 'play-store-512.png'), 'androidRound', 512);
}

console.log('Icone generate.');
