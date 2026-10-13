// Сжимает выбранные звуки из assets-src/sfx в public/assets/sfx (ogg + mp3, моно). Запуск: npm run sfx.
//
// Исходники в репозитории не лежат. Это CC0-паки Kenney, каждый распаковывается в свою папку:
//   assets-src/sfx/interface-sounds  https://kenney.nl/assets/interface-sounds
//   assets-src/sfx/impact-sounds     https://kenney.nl/assets/impact-sounds
//   assets-src/sfx/rpg-audio         https://kenney.nl/assets/rpg-audio
//   assets-src/sfx/digital-audio     https://kenney.nl/assets/digital-audio
// Нужен ffmpeg с libvorbis и libmp3lame.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/sfx';
const OUT = 'public/assets/sfx';
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

const FORMATS = {
  ogg: ['-c:a', 'libvorbis', '-q:a', '3'],
  mp3: ['-c:a', 'libmp3lame', '-q:a', '5'],
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(SRC)) fail(`Нет папки ${SRC}: скачайте паки Kenney, ссылки — в начале scripts/sfx.mjs`);
const missing = Object.values(SOUNDS).filter(({ src }) => !existsSync(join(SRC, src)));
if (missing.length > 0) fail(`Нет исходников:\n${missing.map(({ src }) => `  ${join(SRC, src)}`).join('\n')}`);

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
