// Сжимает выбранные звуки из assets-src/sfx в public/assets/sfx (ogg + mp3, моно)
// и фоновую музыку из assets-src/music в public/assets/music (ogg + mp3, стерео). Запуск: npm run sfx.
//
// Исходники в репозитории не лежат. Это CC0-паки Kenney, каждый распаковывается в свою папку:
//   assets-src/sfx/interface-sounds  https://kenney.nl/assets/interface-sounds
//   assets-src/sfx/impact-sounds     https://kenney.nl/assets/impact-sounds
//   assets-src/sfx/rpg-audio         https://kenney.nl/assets/rpg-audio
//   assets-src/sfx/digital-audio     https://kenney.nl/assets/digital-audio
// Нужен ffmpeg с libvorbis и libmp3lame.
//
// У каждого звука должна быть строка в docs/CREDITS.md с тем же исходным файлом, паком, автором и лицензией:
// без неё скрипт ничего не собирает.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/sfx';
const OUT = 'public/assets/sfx';
const CREDITS = 'docs/CREDITS.md';
/** Общий вес всех файлов (ogg и mp3 вместе), байты. */
const BUDGET = 500 * 1024;
const SAMPLE_RATE = 44100;

// Имя звука (SoundId в src/feel.ts) → исходник. Громкость в игре задаётся в SOUND_FEEL, здесь — только подготовка файла:
//   gain  — усиление в дБ для тихих исходников;
//   pitch — множитель высоты и скорости (меньше 1 — ниже и длиннее).
const SOUNDS = {
  click: { src: 'interface-sounds/Audio/click_001.ogg' },
  summon: { src: 'interface-sounds/Audio/maximize_008.ogg' },
  merge: { src: 'interface-sounds/Audio/confirmation_001.ogg' },
  hybrid: { src: 'interface-sounds/Audio/confirmation_002.ogg' },
  shot: { src: 'interface-sounds/Audio/pluck_001.ogg' },
  hit: { src: 'impact-sounds/Audio/impactSoft_medium_000.ogg' },
  enemyDeath: { src: 'impact-sounds/Audio/impactPunch_medium_001.ogg' },
  coins: { src: 'rpg-audio/Audio/handleCoins2.ogg', gain: 9 },
  lifeLost: { src: 'interface-sounds/Audio/error_006.ogg' },
  meteor: { src: 'impact-sounds/Audio/impactPunch_heavy_000.ogg', pitch: 0.6 },
  win: { src: 'digital-audio/Audio/zapThreeToneUp.ogg' },
  lose: { src: 'digital-audio/Audio/lowThreeTone.ogg' },
};

// Фоновая музыка: имя трека (MusicId в src/feel.ts) → исходник в assets-src/music. Громкость в игре — в MUSIC_FEEL.
// Пока таблица пуста, музыки в игре нет: игра узнаёт о готовых треках из public/assets/music/index.json.
const MUSIC_SRC = 'assets-src/music';
const MUSIC_OUT = 'public/assets/music';
/** Общий вес музыки (ogg и mp3 вместе), байты. Грузится она после запуска игры, по первому обращению к треку. */
const MUSIC_BUDGET = 1500 * 1024;
const MUSIC = {};
const MUSIC_FORMATS = {
  ogg: ['-c:a', 'libvorbis', '-q:a', '2'],
  mp3: ['-c:a', 'libmp3lame', '-q:a', '6'],
};

const FORMATS = {
  ogg: ['-c:a', 'libvorbis', '-q:a', '3'],
  mp3: ['-c:a', 'libmp3lame', '-q:a', '5'],
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Строки таблицы раздела `heading` из docs/CREDITS.md: имя → исходный файл, пак, автор и лицензия.
 * Раздел идёт от своего заголовка до следующего.
 */
function readCredits(heading) {
  if (!existsSync(CREDITS)) fail(`Нет файла ${CREDITS}`);
  const text = readFileSync(CREDITS, 'utf8');
  const start = text.indexOf(`## ${heading}\n`);
  if (start === -1) fail(`В ${CREDITS} нет раздела «${heading}»`);
  const next = text.indexOf('\n## ', start + 1);
  const rows = new Map();
  for (const line of text.slice(start, next === -1 ? undefined : next).split('\n')) {
    if (!line.startsWith('|')) continue;
    const [id, src, pack, author, license] = line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''));
    // Заголовок таблицы и черта под ним — не строки.
    if (!id || /^-+$/.test(id) || src === 'Исходный файл') continue;
    rows.set(id, { src, pack, author, license });
  }
  return rows;
}

/** Сверяет таблицу скрипта с разделом CREDITS; возвращает список расхождений. */
function checkCredits(heading, table) {
  const rows = readCredits(heading);
  const problems = [];
  for (const [id, { src }] of Object.entries(table)) {
    const row = rows.get(id);
    if (!row) problems.push(`${id}: нет строки`);
    else if (row.src !== src) problems.push(`${id}: исходник ${src}, а в ${CREDITS} — ${row.src}`);
    else if (!row.pack || !row.author || !row.license) problems.push(`${id}: не указан пак, автор или лицензия`);
  }
  for (const id of rows.keys()) if (!(id in table)) problems.push(`${id}: строка есть, а в таблице скрипта такого нет`);
  return problems.map((problem) => `  «${heading}», ${problem}`);
}

const uncredited = [...checkCredits('Звуки', SOUNDS), ...checkCredits('Музыка', MUSIC)];
if (uncredited.length > 0) fail(`${CREDITS} расходится с таблицами скрипта:\n${uncredited.join('\n')}`);

if (!existsSync(SRC)) fail(`Нет папки ${SRC}: скачайте паки Kenney, ссылки — в начале scripts/sfx.mjs`);
const missing = [
  ...Object.values(SOUNDS).map(({ src }) => join(SRC, src)),
  ...Object.values(MUSIC).map(({ src }) => join(MUSIC_SRC, src)),
].filter((file) => !existsSync(file));
if (missing.length > 0) fail(`Нет исходников:\n${missing.map((file) => `  ${file}`).join('\n')}`);

// Папка пересобирается целиком, чтобы в сборку не попал звук, убранный из таблицы.
mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) {
  if (file.endsWith('.ogg') || file.endsWith('.mp3')) rmSync(join(OUT, file));
}

let total = 0;
for (const [id, { src, gain = 0, pitch = 1 }] of Object.entries(SOUNDS)) {
  const filters = [];
  if (pitch !== 1) filters.push(`asetrate=${SAMPLE_RATE}*${pitch}`);
  filters.push(`aresample=${SAMPLE_RATE}`);
  if (gain !== 0) filters.push(`volume=${gain}dB`);

  const sizes = [];
  for (const [ext, codec] of Object.entries(FORMATS)) {
    const out = join(OUT, `${id}.${ext}`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-i', join(SRC, src),
      '-af', filters.join(','),
      '-ac', '1',
      // Без обложек и тегов: только звук.
      '-vn', '-map_metadata', '-1',
      ...codec,
      out,
    ]);
    const { size } = statSync(out);
    total += size;
    sizes.push(`${ext} ${(size / 1024).toFixed(1)} КБ`);
  }
  console.log(`${id.padEnd(11)} ${sizes.join(', ')}`);
}

console.log(`Всего ${(total / 1024).toFixed(1)} КБ из ${BUDGET / 1024} КБ`);
if (total > BUDGET) fail('Звуки не укладываются в бюджет');

// Музыка: те же шаги, но стерео и без смены высоты. Рядом — список готовых треков для игры.
mkdirSync(MUSIC_OUT, { recursive: true });
for (const file of readdirSync(MUSIC_OUT)) {
  if (file.endsWith('.ogg') || file.endsWith('.mp3')) rmSync(join(MUSIC_OUT, file));
}
let musicTotal = 0;
for (const [id, { src, gain = 0 }] of Object.entries(MUSIC)) {
  const sizes = [];
  for (const [ext, codec] of Object.entries(MUSIC_FORMATS)) {
    const out = join(MUSIC_OUT, `${id}.${ext}`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-i', join(MUSIC_SRC, src),
      '-af', [`aresample=${SAMPLE_RATE}`, ...(gain !== 0 ? [`volume=${gain}dB`] : [])].join(','),
      '-ac', '2',
      '-vn', '-map_metadata', '-1',
      ...codec,
      out,
    ]);
    const { size } = statSync(out);
    musicTotal += size;
    sizes.push(`${ext} ${(size / 1024).toFixed(1)} КБ`);
  }
  console.log(`музыка ${id.padEnd(8)} ${sizes.join(', ')}`);
}
writeFileSync(join(MUSIC_OUT, 'index.json'), `${JSON.stringify({ tracks: Object.keys(MUSIC) })}\n`);
console.log(`Музыка: ${(musicTotal / 1024).toFixed(1)} КБ из ${MUSIC_BUDGET / 1024} КБ`);
if (musicTotal > MUSIC_BUDGET) fail('Музыка не укладывается в бюджет');
