// Собирает zip-архив для загрузки в консоль Яндекс Игр: содержимое dist/ с index.html в корне.
// Запуск: npm run pack (сначала сборка). Архив: pack/kotooborona-<версия>.zip.
// Архиватор свой, на zlib из Node: системного zip может не быть, а лишних библиотек не берём.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const DIST = 'dist';
const OUT_DIR = 'pack';
/** Требование площадки: распакованная игра не больше 100 МБ. */
const MAX_BYTES = 100 * 1024 * 1024;
/** Требование площадки: в именах файлов нет пробелов и кириллицы. Оставляем только латиницу, цифры и ._- */
const SAFE_NAME = /^[A-Za-z0-9._/-]+$/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
    .sort();
}

/** Дата и время в формате MS-DOS, как их хранит zip. */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zip(files) {
  const { time, day } = dosDateTime(new Date());
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    // Уже сжатое (ogg, mp3, woff2) от deflate только растёт — кладём как есть.
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(day, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function fail(message) {
  console.error(`\npack: ${message}`);
  process.exit(1);
}

let paths;
try {
  paths = walk(DIST);
} catch {
  fail(`нет каталога ${DIST}/ — сначала npm run build`);
}

const files = paths.map((path) => ({
  // В архиве разделитель — всегда прямая косая черта.
  name: relative(DIST, path).split(sep).join('/'),
  data: readFileSync(path),
}));

if (!files.some((file) => file.name === 'index.html')) fail('в корне сборки нет index.html');
const unsafe = files.filter((file) => !SAFE_NAME.test(file.name));
if (unsafe.length > 0) {
  fail(`имена с пробелами, кириллицей или другими недопустимыми знаками:\n${unsafe.map((f) => `  ${f.name}`).join('\n')}`);
}
const total = files.reduce((sum, file) => sum + file.data.length, 0);
if (total > MAX_BYTES) fail(`сборка весит ${(total / 1024 / 1024).toFixed(1)} МБ — больше 100 МБ, допустимых площадкой`);

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = join(OUT_DIR, `kotooborona-${version}.zip`);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(out, zip(files));

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} КБ`;
console.log(`\npack: ${out} — ${kb(statSync(out).size)}, файлов: ${files.length}, без сжатия ${kb(total)}`);
console.log('pack: загрузить в консоли Яндекс Игр: Черновик → Общее → Архив');
