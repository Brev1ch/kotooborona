// Веб-шрифты игры: файлы и лицензии (OFL) лежат в public/assets/fonts.
// Canvas не перерисовывает текст, когда шрифт догружается, поэтому ждём их до первой сцены с текстом.

// Диапазоны подмножеств — как их нарезает Google Fonts.
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

const FACES = [
  { family: 'Russo One', file: 'russo-one-cyrillic', weight: '400', unicodeRange: CYRILLIC },
  { family: 'Russo One', file: 'russo-one-latin', weight: '400', unicodeRange: LATIN },
  { family: 'Rubik', file: 'rubik-cyrillic', weight: '400 700', unicodeRange: CYRILLIC },
  { family: 'Rubik', file: 'rubik-latin', weight: '400 700', unicodeRange: LATIN },
];

/** Дольше не ждём: лучше системный шрифт, чем пустой экран на плохой сети. */
const TIMEOUT_MS = 3000;

export function loadFonts(): Promise<void> {
  const loads = FACES.map(({ family, file, weight, unicodeRange }) => {
    const url = `${import.meta.env.BASE_URL}assets/fonts/${file}.woff2`;
    const face = new FontFace(family, `url("${url}") format("woff2")`, { weight, unicodeRange });
    document.fonts.add(face);
    return face.load();
  });
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS));
  return Promise.race([Promise.allSettled(loads).then(() => undefined), timeout]);
}
