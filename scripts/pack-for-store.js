/**
 * Creates a ZIP for Chrome Web Store upload.
 * Includes: manifest.json, dist/*.js and dist/*.css, icons/icon*.png
 * Run from project root: node scripts/pack-for-store.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = (pkg.version || '1.0.0').replace(/[^0-9.]/g, '');
const zipName = `attention-guard-v${version}.zip`;

const archiver = (() => {
  try {
    return require('archiver');
  } catch (e) {
    console.error('Missing "archiver". Install with: npm install --save-dev archiver');
    process.exit(1);
  }
})();

const output = fs.createWriteStream(path.join(root, zipName));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${zipName} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});

archive.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

archive.pipe(output);

// Manifest
archive.file(path.join(root, 'manifest.json'), { name: 'manifest.json' });

// Dist
const distDir = path.join(root, 'dist');
if (fs.existsSync(distDir)) {
  ['background.js', 'content.js', 'styles.css'].forEach((f) => {
    const p = path.join(distDir, f);
    if (fs.existsSync(p)) {
      archive.file(p, { name: `dist/${f}` });
    }
  });
} else {
  console.error('Run "npm run build" first.');
  process.exit(1);
}

// Icons (manifest expects icon16.png, icon48.png, icon128.png)
const iconsDir = path.join(root, 'icons');
[16, 48, 128].forEach((n) => {
  const standard = path.join(iconsDir, `icon${n}.png`);
  const logo = path.join(iconsDir, `logo_${n}x${n}.png`);
  const src = fs.existsSync(standard) ? standard : fs.existsSync(logo) ? logo : null;
  if (src) {
    archive.file(src, { name: `icons/icon${n}.png` });
  } else {
    console.warn(`Warning: icon ${n}px not found (icon${n}.png or logo_${n}x${n}.png)`);
  }
});

archive.finalize();
