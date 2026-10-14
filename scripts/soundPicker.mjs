// Страница для прослушивания звуков: /sound-picker.html на сервере разработки (`npm run dev`). В сборку она не попадает:
// плагин работает только в `vite serve`. Страница — scripts/sound-picker.html; плагин отдаёт ей список исходников
// из assets-src/sfx, сами файлы и то, к каким событиям игры они подключены в таблице SOUNDS (scripts/sfx.mjs).

import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

const PAGE = 'scripts/sound-picker.html';
const SFX = 'assets-src/sfx';
const TABLE = 'scripts/sfx.mjs';
const AUDIO = new Set(['.ogg', '.wav', '.mp3']);
const TYPES = { '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

/** Строки таблицы SOUNDS: событие → исходник. */
export function readSounds(source) {
  const body = /const SOUNDS = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '';
  const sounds = {};
  for (const [, id, src] of body.matchAll(/^\s*(\w+):\s*\{\s*src:\s*'([^']+)'/gm)) sounds[id] = src;
  return sounds;
}

function listAudio(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listAudio(path);
    return AUDIO.has(extname(entry.name).toLowerCase()) ? [relative(SFX, path).split(sep).join('/')] : [];
  });
}

/** @returns {import('vite').Plugin} */
export function soundPicker() {
  return {
    name: 'sound-picker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/sound-picker.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(PAGE, 'utf8'));
          return;
        }
        if (url.pathname === '/__sound-picker/list') {
          const files = statSync(SFX, { throwIfNoEntry: false })?.isDirectory() ? listAudio(SFX).sort() : [];
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ files, sounds: readSounds(readFileSync(TABLE, 'utf8')) }));
          return;
        }
        if (url.pathname.startsWith('/__sound-picker/file/')) {
          const root = resolve(SFX);
          const file = resolve(root, decodeURIComponent(url.pathname.slice('/__sound-picker/file/'.length)));
          // Только файлы из assets-src/sfx: путь с «..» наружу не выпускается.
          if (!file.startsWith(root + sep) || !AUDIO.has(extname(file).toLowerCase()) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()]);
          createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}
