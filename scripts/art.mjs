// Готовит арт по манифесту src/data/art.json: исходники из assets-src/art → public/assets/art. Запуск: npm run art.
//
// Исходники в репозитории не лежат: это png с прозрачным фоном, имена — из поля `file` манифеста
// (assets-src/art/cats/fire.png и так далее). Каких файлов нет — тех картинок в игре нет, на их месте рисунок кодом.
//   Картинка атласа без прозрачности (генератор рисует на белом): однотонный фон убирается заливкой от краёв,
//     поэтому белое внутри контура (глаза, блики) остаётся.
//   Картинка атласа: прозрачные края обрезаются, остаток вписывается в размер из манифеста по центру.
//   Фон кнопки (`slice`): растягивается ровно в размер, края не обрезаются.
//   Фон уровня: обрезается под размер и лежит отдельным файлом — игра грузит его при входе в уровень.
// Рядом пишется index.json: какие картинки готовы, где они в атласах и сколько весят,
// а в docs/ART_LIST.md — список всех картинок для художника с отметкой готовности.
//
//   npm run art -- --src <папка> --out <папка>   другие папки (смоук-проверка с заглушками)
//   npm run art -- --placeholders                сначала нарисовать в папке исходников заглушки всех картинок

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { artList } from '../src/systems/ArtList.ts';

/** Общий вес готового арта, байты. */
const BUDGET = 3 * 1024 * 1024;
/** Сторона атласа не больше этой: предел текстуры слабых телефонов. */
const ATLAS_MAX = 2048;
const ATLAS_WIDTH = 1024;
/** Зазор между кадрами атласа: соседний кадр не просвечивает по краю при масштабировании. */
const PADDING = 2;
/** Фон исходника без прозрачности: насколько цвет точки может отличаться от цвета угла, оставаясь фоном (расстояние в RGB). */
const BACKGROUND_TOLERANCE = 48;
const ATLAS_WEBP = { quality: 90, alphaQuality: 100, effort: 6 };
const BACKGROUND_WEBP = { quality: 82, effort: 6 };

function fail(message) {
  console.error(message);
  process.exit(1);
}

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

const SRC = option('src', 'assets-src/art');
const OUT = option('out', 'public/assets/art');
const LIST = 'docs/ART_LIST.md';
const manifest = JSON.parse(readFileSync('src/data/art.json', 'utf8'));
const levels = JSON.parse(readFileSync('src/data/levels.json', 'utf8')).levels;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

/** Цвет заглушки по группе: на снимке видно, что стоит картинка, а не рисунок кодом. */
const PLACEHOLDER_COLORS = {
  cats: '#d9488f',
  enemies: '#7a3fd0',
  hero: '#2f9e8f',
  buildings: '#c98a1b',
  items: '#3f7fd0',
  icons: '#d0a53f',
  buttons: '#8f2f5f',
  portraits: '#4f8f2f',
  backgrounds: '#2b3f33',
};

/** Заглушка картинки: фигура цвета группы с именем. У атласных — с прозрачным полем вокруг, чтобы обрезка тоже работала. */
async function writePlaceholder(image) {
  const { width: w, height: h, group, id } = image;
  const color = PLACEHOLDER_COLORS[group];
  const font = Math.max(8, Math.min(w / (id.length * 0.62), h / 3));
  const label = `<text x="${w / 2}" y="${h / 2}" font-family="sans-serif" font-size="${font}" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${id}</text>`;
  let body;
  if (group === 'backgrounds') {
    body = `<rect width="${w}" height="${h}" fill="${color}"/><rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="#5f8f6f" stroke-width="6"/>`;
  } else if (image.slice) {
    body = `<rect width="${w}" height="${h}" rx="${image.slice}" fill="${color}"/><rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${image.slice - 4}" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="3"/>`;
  } else {
    const pad = Math.round(Math.min(w, h) * 0.1);
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - pad}" ry="${h / 2 - pad}" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}${image.slice ? '' : label}</svg>`;
  const file = join(SRC, image.file);
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

if (process.argv.includes('--placeholders')) {
  if (SRC === 'assets-src/art') fail('Заглушки затёрли бы настоящие исходники: укажите другую папку через --src');
  for (const image of manifest.images) await writePlaceholder(image);
}

/**
 * Исходник с прозрачностью — как есть. У исходника без неё фон убирается: заливка от краёв по цвету левого верхнего угла.
 * Точки на границе получают прозрачность по тому, насколько они похожи на фон: край не остаётся с белой каймой.
 */
async function withAlpha(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { opaque = false; break; }
  const raw = { raw: { width, height, channels: 4 } };
  if (!opaque) return sharp(data, raw);

  const [br, bg, bb] = data;
  const distance = (p) => Math.hypot(data[p * 4] - br, data[p * 4 + 1] - bg, data[p * 4 + 2] - bb);
  const background = new Uint8Array(width * height);
  const stack = [];
  const visit = (p) => {
    if (background[p] || distance(p) > BACKGROUND_TOLERANCE) return;
    background[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }
  for (let p = 0; p < width * height; p++) {
    if (background[p]) { data[p * 4 + 3] = 0; continue; }
    const x = p % width;
    const edge = (x > 0 && background[p - 1]) || (x < width - 1 && background[p + 1]) || (p >= width && background[p - width]) || (p < width * (height - 1) && background[p + width]);
    if (edge) data[p * 4 + 3] = Math.round(255 * Math.min(1, distance(p) / (BACKGROUND_TOLERANCE * 3)));
  }
  return sharp(data, raw);
}

/** Картинка атласа: точки и размер после обрезки и подгонки. */
async function prepareFrame(image, file) {
  let pipeline = await withAlpha(file);
  if (image.slice) {
    pipeline = pipeline.resize(image.width, image.height, { fit: 'fill' });
  } else {
    // Обрезка отдельным шагом: sharp меняет размер раньше, чем обрезает, если сделать это одной цепочкой.
    let trimmed;
    try {
      trimmed = await pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
    } catch {
      // Обрезать нечего: картинка без прозрачных краёв.
      trimmed = await (await withAlpha(file)).png().toBuffer();
    }
    pipeline = sharp(trimmed).resize(image.width, image.height, { fit: 'inside' });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { image, data, width: info.width, height: info.height };
}

/** Раскладывает кадры по полкам: по убыванию высоты, слева направо. Возвращает высоту атласа. */
function pack(frames) {
  frames.sort((a, b) => b.height - a.height || a.image.id.localeCompare(b.image.id));
  let x = PADDING;
  let y = PADDING;
  let shelf = 0;
  for (const frame of frames) {
    if (frame.width + PADDING * 2 > ATLAS_WIDTH) fail(`${frame.image.id}: шире атласа (${frame.width} пикс.)`);
    if (x + frame.width + PADDING > ATLAS_WIDTH) {
      x = PADDING;
      y += shelf + PADDING;
      shelf = 0;
    }
    frame.x = x;
    frame.y = y;
    x += frame.width + PADDING;
    shelf = Math.max(shelf, frame.height);
  }
  return y + shelf + PADDING;
}

// Папка пересобирается целиком, чтобы в сборку не попала картинка, убранная из манифеста или из исходников.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index = { atlases: {}, images: {} };
const ready = manifest.images.filter((image) => existsSync(join(SRC, image.file)));

const atlasNames = [...new Set(ready.filter((image) => image.atlas).map((image) => image.atlas))].sort();
for (const name of atlasNames) {
  const frames = [];
  for (const image of ready.filter((entry) => entry.atlas === name)) frames.push(await prepareFrame(image, join(SRC, image.file)));
  const height = pack(frames);
  if (height > ATLAS_MAX) fail(`Атлас ${name} выше ${ATLAS_MAX} пикс.: разделите его в манифесте`);

  const file = `${name}.webp`;
  await sharp({ create: { width: ATLAS_WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((frame) => ({ input: frame.data, raw: { width: frame.width, height: frame.height, channels: 4 }, left: frame.x, top: frame.y })))
    .webp(ATLAS_WEBP)
    .toFile(join(OUT, file));

  // Кадр записан так, как его читает Phaser: место в атласе и где обрезанная картинка стоит внутри полного размера.
  const entries = {};
  for (const frame of frames.sort((a, b) => a.image.id.localeCompare(b.image.id))) {
    const { width: fullW, height: fullH } = frame.image;
    entries[frame.image.id] = {
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: frame.width !== fullW || frame.height !== fullH,
      spriteSourceSize: { x: Math.floor((fullW - frame.width) / 2), y: Math.floor((fullH - frame.height) / 2), w: frame.width, h: frame.height },
      sourceSize: { w: fullW, h: fullH },
    };
  }
  index.atlases[name] = { file, bytes: statSync(join(OUT, file)).size, width: ATLAS_WIDTH, height, frames: entries };
}

for (const image of ready.filter((entry) => !entry.atlas)) {
  const file = image.file.replace(/\.png$/, '.webp');
  mkdirSync(dirname(join(OUT, file)), { recursive: true });
  await sharp(join(SRC, image.file)).resize(image.width, image.height, { fit: 'cover' }).flatten({ background: '#000000' }).webp(BACKGROUND_WEBP).toFile(join(OUT, file));
  index.images[image.id] = { file, bytes: statSync(join(OUT, file)).size };
}

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index)}\n`);
const indexBytes = statSync(join(OUT, 'index.json')).size;

// Список для художника — только от настоящего арта: заглушки смоук-проверки в него не попадают.
if (OUT === 'public/assets/art') writeFileSync(LIST, artList(manifest, new Set(ready.map((image) => image.id))));

// Отчёт о весе. При запуске игра грузит список, атласы и фон первого уровня; фоны остальных — при входе в уровень.
const firstLevel = levels[0].id;
const atlasBytes = Object.values(index.atlases).reduce((sum, atlas) => sum + atlas.bytes, 0);
const backgrounds = manifest.images.filter((image) => image.level && index.images[image.id]);
const firstBackground = backgrounds.find((image) => image.level === firstLevel);
const startup = indexBytes + atlasBytes + (firstBackground ? index.images[firstBackground.id].bytes : 0);
const total = indexBytes + atlasBytes + Object.values(index.images).reduce((sum, image) => sum + image.bytes, 0);

for (const [name, atlas] of Object.entries(index.atlases)) {
  console.log(`атлас ${name.padEnd(8)} ${String(Object.keys(atlas.frames).length).padStart(3)} картинок, ${atlas.width}×${atlas.height}, ${kb(atlas.bytes)}`);
}
for (const image of backgrounds) console.log(`фон ${image.level.padEnd(10)} ${kb(index.images[image.id].bytes)}${image.level === firstLevel ? ' (при запуске)' : ''}`);
const missing = manifest.images.filter((image) => !ready.includes(image));
console.log(`Готово картинок: ${ready.length} из ${manifest.images.length}`);
if (missing.length > 0 && missing.length <= 12) console.log(`Нет исходников: ${missing.map((image) => image.file).join(', ')}`);
console.log(`Стартовая загрузка (список, атласы, фон первого уровня): ${kb(startup)}`);
console.log(`По входу в уровни (фоны остальных уровней): ${kb(total - startup)}`);
console.log(`Всего ${kb(total)} из ${BUDGET / 1024} КБ`);
if (total > BUDGET) fail('Арт не укладывается в бюджет');

// Заблудившиеся исходники: файл есть, а в манифесте его нет — скорее всего, опечатка в имени.
if (existsSync(SRC)) {
  const known = new Set(manifest.images.map((image) => image.file));
  const walk = (dir) => readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));
  const stray = walk('').filter((file) => file.endsWith('.png') && !known.has(file.split('\\').join('/')));
  if (stray.length > 0) console.warn(`Нет в манифесте (проверьте имена): ${stray.join(', ')}`);
}
