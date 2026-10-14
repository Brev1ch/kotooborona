// Готовит арт по манифесту src/data/art.json: исходники из assets-src/art → public/assets/art. Запуск: npm run art.
//
// Исходники в репозитории не лежат: это png с прозрачным фоном, имена — из поля `file` манифеста
// (assets-src/art/cats/fire.png и так далее). Каких файлов нет — тех картинок в игре нет, на их месте рисунок кодом.
//   Картинка атласа без прозрачности (генератор рисует на светлой бумаге): фон убирается заливкой от краёв,
//     поэтому белое внутри контура (глаза, грудка, облако) остаётся.
//   Коты (группа `cats`) — в едином масштабе тела, а не по рамке: высота от низа лап до линии щёк у всех одна
//     (src/systems/CatFit.ts), ось тела — посередине квадрата, лапы — на нижнем краю; `scale` в манифесте — ручная поправка кота.
//   Другая картинка с `align: bottom` встаёт в свой размер по нижнему краю, остальные — по центру.
//   Рядом с исходниками пишется preview.png: все готовые коты в ряд на траве и на тёмном поле — проверить вырезку глазами;
//     линии — низ лап и линия щёк, у всех котов они должны совпасть. Так же — preview-enemies.png: враги в игровом размере
//     на траве и на дороге (копия — docs/screens/enemies-preview.png); у врагов одного размера линии тоже совпадают.
//   Враги (группа `enemies`) — в своём едином масштабе тела, умноженном на `size` из enemies.json; вырезаются с мягким краем.
//   Картинка атласа: прозрачные края обрезаются, остаток вписывается в размер из манифеста по центру.
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
import { measureCat, placeFigures } from '../src/systems/CatFit.ts';

/** Общий вес готового арта, байты. */
const BUDGET = 3 * 1024 * 1024;
/** Сторона атласа не больше этой: предел текстуры слабых телефонов. */
const ATLAS_MAX = 2048;
const ATLAS_WIDTH = 1024;
/** Зазор между кадрами атласа: соседний кадр не просвечивает по краю при масштабировании. */
const PADDING = 2;
/**
 * Фон исходника без прозрачности — светлая бумага: точка считается фоном, если самый тёмный её канал не темнее MIN_LIGHT,
 * а разброс каналов (насыщенность) не больше MAX_CHROMA. ERODE — на сколько точек сжимается маска после заливки.
 */
const BACKGROUND_MIN_LIGHT = 222;
const BACKGROUND_MAX_CHROMA = 22;
const BACKGROUND_ERODE = 1;
/** Островок вне фигуры остаётся, только если он не меньше этой доли самой большой фигуры. */
const BACKGROUND_MIN_ISLAND = 0.01;
/**
 * Мягкий край (враги): от фона заливка идёт дальше, в точки, отличающиеся от бумаги меньше чем на SOFT_MAX
 * (расстояние по цветам). Контур фигуры тёмный, через него заливка не проходит. Малонасыщенные из этих точек
 * (серая тень под ногами, крапинки бумаги; разброс каналов не больше SHADOW_MAX_CHROMA) становятся прозрачными,
 * цветные (ореол огонька, фонаря) — полупрозрачными от SOFT_MIN до SOFT_MAX, а цвет бумаги из них вычитается:
 * на тёмной дороге не остаётся светлой каймы.
 */
const SOFT_MIN = 50;
const SOFT_MAX = 115;
const SHADOW_MAX_CHROMA = 26;
/** Превью котов: сторона клетки с котом, фоны, на которых он проверяется, — трава и тёмное поле, цвета линий лап и щёк. */
const PREVIEW = { file: 'preview.png', size: 96, gap: 8, backgrounds: ['#5d9b4b', '#1e2740'], ground: '#ff4fd8', cheek: '#ffe14f' };
/** Превью врагов: в игровом размере (картинки атласа как есть, экран телефона ×2) на траве и на дороге (COLORS.road). */
const PREVIEW_ENEMIES = { file: 'preview-enemies.png', copy: 'docs/screens/enemies-preview.png', gap: 8, backgrounds: ['#5d9b4b', '#4b4230'] };
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
const enemyTypes = JSON.parse(readFileSync('src/data/enemies.json', 'utf8')).types;
/** Группы в едином масштабе тела (src/systems/CatFit.ts): у каждой свой общий масштаб. */
const FIGURE_GROUPS = ['cats', 'enemies'];
/**
 * Во сколько раз фигура крупнее остальных своей группы: у врага — `size` из enemies.json (у картинки состояния — её `sizeOf`),
 * у кота — 1; сверху — ручной `scale`.
 */
const figureScale = (image) => (image.group === 'enemies' ? enemyTypes[image.sizeOf ?? image.id.replace(/^enemy-/, '')].size : 1) * (image.scale ?? 1);
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
  } else {
    const pad = Math.round(Math.min(w, h) * 0.1);
    body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - pad}" ry="${h / 2 - pad}" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}${label}</svg>`;
  const file = join(SRC, image.file);
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

if (process.argv.includes('--placeholders')) {
  if (SRC === 'assets-src/art') fail('Заглушки затёрли бы настоящие исходники: укажите другую папку через --src');
  for (const image of manifest.images) await writePlaceholder(image);
}

/**
 * Исходник с прозрачностью — как есть. У исходника без неё убирается фон: заливка от всех краёв по точкам, похожим на бумагу
 * (светлым и малонасыщенным). Белое внутри контура (грудка, облако пара, вихрь) заливка не достаёт, и оно остаётся.
 * Затем маска сжимается на точку: светлая кайма вдоль контура уходит вместе с фоном.
 */
async function withAlpha(file, { soft = false } = {}) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { opaque = false; break; }
  const raw = { raw: { width, height, channels: 4 } };
  if (!opaque) return sharp(data, raw);

  const isPaper = (p) => {
    const r = data[p * 4];
    const g = data[p * 4 + 1];
    const b = data[p * 4 + 2];
    return Math.min(r, g, b) >= BACKGROUND_MIN_LIGHT && Math.max(r, g, b) - Math.min(r, g, b) <= BACKGROUND_MAX_CHROMA;
  };
  const background = new Uint8Array(width * height);
  const stack = [];
  const visit = (p) => {
    if (background[p] || !isPaper(p)) return;
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
  const alpha = new Uint8Array(width * height).fill(255);
  if (soft) softEdges(data, width, height, background, alpha);
  // Сжатие маски: точка рядом с фоном тоже становится прозрачной.
  for (let step = 0; step < BACKGROUND_ERODE; step++) {
    const edge = [];
    for (let p = 0; p < width * height; p++) {
      if (background[p]) continue;
      const x = p % width;
      if ((x > 0 && background[p - 1]) || (x < width - 1 && background[p + 1]) || (p >= width && background[p - width]) || (p < width * (height - 1) && background[p + width])) edge.push(p);
    }
    for (const p of edge) background[p] = 1;
  }
  // Крапинки бумаги темнее порога остаются островками в стороне от фигуры и растягивают её рамку: мелкие островки уходят в фон.
  const island = new Int32Array(width * height);
  const sizes = [0];
  for (let start = 0; start < width * height; start++) {
    if (background[start] || island[start]) continue;
    const id = sizes.length;
    let size = 0;
    island[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop();
      size++;
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || background[q] || island[q]) continue;
        island[q] = id;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  const keep = Math.max(...sizes) * BACKGROUND_MIN_ISLAND;
  for (let p = 0; p < width * height; p++) data[p * 4 + 3] = background[p] || sizes[island[p]] < keep ? 0 : alpha[p];
  return sharp(data, raw);
}

/** Мягкий край фигуры, см. SOFT_MIN: меняет `background`, `alpha` и цвета полупрозрачных точек в `data`. */
function softEdges(data, width, height, background, alpha) {
  // Цвет бумаги — средний по уже найденному фону.
  const paper = [0, 0, 0];
  let count = 0;
  for (let p = 0; p < width * height; p++) {
    if (!background[p]) continue;
    for (let c = 0; c < 3; c++) paper[c] += data[p * 4 + c];
    count++;
  }
  if (count === 0) return;
  for (let c = 0; c < 3; c++) paper[c] /= count;
  const distance = (p) => Math.hypot(data[p * 4] - paper[0], data[p * 4 + 1] - paper[1], data[p * 4 + 2] - paper[2]);

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let p = 0; p < width * height; p++) if (background[p]) { seen[p] = 1; stack.push(p); }
  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
      if (q < 0 || q >= width * height || seen[q]) continue;
      seen[q] = 1;
      const d = distance(q);
      if (d >= SOFT_MAX) continue;
      stack.push(q);
      const r = data[q * 4];
      const g = data[q * 4 + 1];
      const b = data[q * 4 + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) <= SHADOW_MAX_CHROMA) {
        background[q] = 1;
        continue;
      }
      const a = Math.min(1, Math.max(0, (d - SOFT_MIN) / (SOFT_MAX - SOFT_MIN)));
      if (a === 0) {
        background[q] = 1;
        continue;
      }
      // Точка = бумага·(1−a) + свечение·a: свечение без бумаги.
      for (let c = 0; c < 3; c++) data[q * 4 + c] = Math.min(255, Math.max(0, Math.round(paper[c] + (data[q * 4 + c] - paper[c]) / a)));
      alpha[q] = Math.round(a * 255);
    }
  }
}

/** Картинка атласа: точки и размер после обрезки и подгонки. */
async function prepareFrame(image, file) {
  let pipeline = await withAlpha(file, { soft: image.group === 'enemies' });
  // Обрезка отдельным шагом: sharp меняет размер раньше, чем обрезает, если сделать это одной цепочкой.
  let trimmed;
  try {
    trimmed = await pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
  } catch {
    // Обрезать нечего: картинка без прозрачных краёв.
    trimmed = await (await withAlpha(file, { soft: image.group === 'enemies' })).png().toBuffer();
  }
  pipeline = sharp(trimmed).resize(image.width, image.height, { fit: 'inside' });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  // Где обрезанная картинка стоит внутри полного размера.
  const x = Math.floor((image.width - width) / 2);
  const y = image.align === 'bottom' ? image.height - height : Math.floor((image.height - height) / 2);
  return { image, data, width, height, offsetX: x, offsetY: y };
}

/**
 * Фигуры группы (коты или враги) в едином масштабе тела: замер всех, общий масштаб, затем каждая — обрезанная фигура
 * и её место в своём квадрате.
 */
async function prepareFigures(images) {
  const sources = [];
  for (const image of images) {
    if (image.width !== image.height) fail(`${image.id}: картинка ${image.group} должна быть квадратной`);
    const { data, info } = await (await withAlpha(join(SRC, image.file), { soft: image.group === 'enemies' })).raw().toBuffer({ resolveWithObject: true });
    const measure = measureCat(info.width, info.height, (x, y) => data[(y * info.width + x) * 4 + 3] > 0);
    if (!measure) fail(`${image.file}: не нашлась голова — фигура пустая или без широкой части`);
    sources.push({ image, data, info, measure });
  }
  const placements = placeFigures(sources.map(({ image, measure }) => ({ measure, scale: figureScale(image), frame: image.width })));
  const frames = [];
  for (const [i, { image, data, info, measure: m }] of sources.entries()) {
    const p = placements[i];
    const size = image.width;
    const width = Math.min(size, Math.max(1, Math.round((m.right + 1 - m.left) * p.factor)));
    const height = Math.min(size, Math.max(1, Math.round((m.bottom + 1 - m.top) * p.factor)));
    const resized = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: m.left, top: m.top, width: m.right + 1 - m.left, height: m.bottom + 1 - m.top })
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer();
    frames.push({
      image,
      data: resized,
      width,
      height,
      offsetX: Math.min(size - width, Math.max(0, Math.round(p.x))),
      offsetY: size - height,
      cheekY: p.cheekY,
    });
  }
  return frames;
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
/** Готовые кадры котов и врагов — для превью. */
const figureFrames = { cats: [], enemies: [] };
const ready = manifest.images.filter((image) => existsSync(join(SRC, image.file)));

const atlasNames = [...new Set(ready.filter((image) => image.atlas).map((image) => image.atlas))].sort();
for (const name of atlasNames) {
  const images = ready.filter((entry) => entry.atlas === name);
  const frames = [];
  for (const group of FIGURE_GROUPS) {
    const members = images.filter((entry) => entry.group === group);
    if (members.length === 0) continue;
    const prepared = await prepareFigures(members);
    frames.push(...prepared);
    figureFrames[group].push(...prepared);
  }
  for (const image of images.filter((entry) => !FIGURE_GROUPS.includes(entry.group))) frames.push(await prepareFrame(image, join(SRC, image.file)));
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
      spriteSourceSize: { x: frame.offsetX, y: frame.offsetY, w: frame.width, h: frame.height },
      sourceSize: { w: fullW, h: fullH },
    };
  }
  index.atlases[name] = { file, bytes: statSync(join(OUT, file)).size, width: ATLAS_WIDTH, height, frames: entries };
}

/**
 * Ряд фигур на каждом из фонов, лапами на одной линии; поверх — линии лап и щёк, проведённые по замеру каждой фигуры:
 * у фигур одного размера они должны слиться. `k` — во сколько раз уменьшить картинку атласа.
 */
async function writePreview(frames, file, { backgrounds, gap, k, tile }) {
  const { ground, cheek } = PREVIEW;
  const order = manifest.images.map((image) => image.id);
  frames.sort((a, b) => order.indexOf(a.image.id) - order.indexOf(b.image.id));
  const tileW = (frame) => tile ?? Math.round(frame.image.width * k);
  const tileH = Math.max(...frames.map((frame) => tile ?? Math.round(frame.image.height * k)));
  const width = gap + frames.reduce((sum, frame) => sum + tileW(frame) + gap, 0);
  const rowHeight = tileH + gap * 2;
  const line = (color, left, w, top) => ({ input: { create: { width: w, height: 1, channels: 4, background: color } }, left, top: Math.round(top) });
  const layers = [];
  for (const [row, background] of backgrounds.entries()) {
    layers.push({ input: { create: { width, height: rowHeight, channels: 4, background } }, left: 0, top: row * rowHeight });
    let left = gap;
    for (const frame of frames) {
      const scale = tile ? tile / frame.image.width : k;
      const w = Math.max(1, Math.round(frame.width * scale));
      const h = Math.max(1, Math.round(frame.height * scale));
      const bottom = row * rowHeight + gap + tileH;
      const image = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).resize(w, h, { fit: 'fill' }).png().toBuffer();
      layers.push({ input: image, left: left + Math.round(frame.offsetX * scale), top: bottom - h });
      const lineW = tileW(frame);
      layers.push(line(cheek, left, lineW, bottom - (frame.image.height - frame.cheekY) * scale), line(ground, left, lineW, bottom));
      left += lineW + gap;
    }
  }
  await sharp({ create: { width, height: rowHeight * backgrounds.length, channels: 4, background: '#000000' } })
    .composite(layers)
    .png()
    .toFile(file);
}

// Превью: только для настоящих исходников, заглушкам смоук-проверки оно не нужно.
if (OUT === 'public/assets/art') {
  if (figureFrames.cats.length > 0) {
    await writePreview(figureFrames.cats, join(SRC, PREVIEW.file), { backgrounds: PREVIEW.backgrounds, gap: PREVIEW.gap, tile: PREVIEW.size });
  }
  if (figureFrames.enemies.length > 0) {
    const { file, copy, gap, backgrounds } = PREVIEW_ENEMIES;
    await writePreview(figureFrames.enemies, join(SRC, file), { backgrounds, gap, k: 1 });
    writeFileSync(copy, readFileSync(join(SRC, file)));
  }
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
const atlasBytes = Object.values(index.atlases).reduce((sum, atlas) => sum + atlas.bytes, 0);
const firstLevelBackground = levels[0].background;
const backgrounds = manifest.images.filter((image) => image.background && index.images[image.id]);
const firstBackground = backgrounds.find((image) => image.background === firstLevelBackground);
const startup = indexBytes + atlasBytes + (firstBackground ? index.images[firstBackground.id].bytes : 0);
const total = indexBytes + atlasBytes + Object.values(index.images).reduce((sum, image) => sum + image.bytes, 0);

for (const [name, atlas] of Object.entries(index.atlases)) {
  console.log(`атлас ${name.padEnd(8)} ${String(Object.keys(atlas.frames).length).padStart(3)} картинок, ${atlas.width}×${atlas.height}, ${kb(atlas.bytes)}`);
}
for (const image of backgrounds) console.log(`фон ${image.background.padEnd(10)} ${kb(index.images[image.id].bytes)}${image.background === firstLevelBackground ? ' (при запуске)' : ''}`);
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
  const stray = walk('').filter((file) => file.endsWith('.png') && file !== PREVIEW.file && !known.has(file.split('\\').join('/')));
  if (stray.length > 0) console.warn(`Нет в манифесте (проверьте имена): ${stray.join(', ')}`);
}
