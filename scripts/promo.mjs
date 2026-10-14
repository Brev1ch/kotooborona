// Промо для каталога Яндекс Игр (npm run promo): скриншоты и видео геймплея, без готового промо-арта.
//   1. Playwright (playwright.promo.config.ts, сценарии — smoke/catalog.promo.ts) играет сборку и снимает
//      сцены боя 720×1280 на русском и английском → pack/promo/screens/<язык>/, записывает геймплей с холста игры → pack/promo/raw.webm.
//   2. ffmpeg кладёт портретную запись в рамку 1920×1080: по бокам — та же запись, растянутая, размытая и притемнённая.
//      MP4 H.264, без звука (музыки в игре пока нет), не длиннее MAX_SECONDS → pack/promo/video.mp4.
// Нужен ffmpeg в PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const OUT = 'pack/promo';
const RAW = `${OUT}/raw.webm`;
const VIDEO = `${OUT}/video.mp4`;
/** Требование каталога — до 28 с; берём с запасом на округление кадров. */
const MAX_SECONDS = 27.5;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
/** Размытие и затемнение боков. */
const BLUR = 40;
const DIM = -0.18;

rmSync(`${OUT}/screens`, { recursive: true, force: true });
rmSync(RAW, { force: true });

const run = spawnSync('npx', ['playwright', 'test', '-c', 'playwright.promo.config.ts'], { encoding: 'utf8', shell: process.platform === 'win32' });
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);

if (!existsSync(RAW)) {
  console.error(`Промо: нет записи геймплея ${RAW}`);
  process.exit(1);
}
const filter = [
  `[0:v]split=2[a][b]`,
  `[a]scale=${WIDTH}:-2,crop=${WIDTH}:${HEIGHT},boxblur=${BLUR}:2,eq=brightness=${DIM}[bg]`,
  `[b]scale=-2:${HEIGHT}:flags=lanczos[fg]`,
  `[bg][fg]overlay=(W-w)/2:0,fps=${FPS},format=yuv420p`,
].join(';');
execFileSync(
  'ffmpeg',
  ['-loglevel', 'error', '-y', '-i', RAW, '-t', String(MAX_SECONDS), '-filter_complex', filter,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-an', VIDEO],
  { stdio: 'inherit' },
);

// Промежуточная запись больше не нужна: видео пересобирается вместе с ней заново.
rmSync(RAW, { force: true });

const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration,size', '-of', 'json', VIDEO], { encoding: 'utf8' }),
);
const stream = probe.streams[0];
const seconds = Number(probe.format.duration);
const problems = [];
if (stream.codec_name !== 'h264') problems.push(`кодек ${stream.codec_name}, а нужен h264`);
if (stream.width !== WIDTH || stream.height !== HEIGHT) problems.push(`размер ${stream.width}×${stream.height}, а нужен ${WIDTH}×${HEIGHT}`);
if (seconds > 28) problems.push(`длина ${seconds.toFixed(1)} с — больше 28`);
console.log(`Видео: ${VIDEO} — ${stream.width}×${stream.height}, ${stream.codec_name}, ${seconds.toFixed(1)} с, ${Math.round(probe.format.size / 1024)} КБ`);
console.log(`Скриншоты: ${OUT}/screens/ru и ${OUT}/screens/en (720×1280)`);
if (problems.length > 0) {
  console.error(`Промо: ${problems.join('; ')}`);
  process.exit(1);
}
