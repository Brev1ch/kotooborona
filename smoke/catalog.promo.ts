import { test, type Page } from '@playwright/test';
import { CONTROLS_CENTER_Y, GAME_H, GAME_W, METEOR_X, SUMMON_X } from '../src/layout';
import { SceneKey } from '../src/scenes/keys';
import type { ElementId, EnemyTypeId } from '../src/data/types';
import type { SmokeState } from '../src/smoke';

// Промо для каталога Яндекс Игр (npm run promo): красивые сцены боя и запись геймплея для видео.
// Игра — сборка, без отладочных надписей; зонд смоука (`?smoke&promo`) расставляет сцены, но зерна случайности не задаёт.
// Снимки — pack/promo/screens/<язык>/, запись геймплея с холста — pack/promo/raw.webm (видео из неё собирает scripts/promo.mjs).

const OUT = 'pack/promo';
const SCREEN_TIMEOUT = 10_000;
/** Радиус метеора из gear.json: туда, где в этом круге больше всего врагов, и бьём. */
const METEOR_RADIUS = 75;
/** Столько висит надпись о начале волны. */
const WAVE_BANNER_MS = 1800;
/** Метеор летит 300 мс (`METEOR_FEEL.flightMs`), взрыв во всю силу — чуть позже. */
const METEOR_BLAST_MS = 330;
/** Смешение длится 4 с (`gear.json` → `ritual.time`); после него — вспышка и «Открыт новый кот». */
const RITUAL_MS = 4000;
/** Длина записи для видео: каталог принимает до 28 с. */
const VIDEO_MS = 26_000;
const VIDEO_BITRATE = 12_000_000;

type Cat = readonly [ElementId, number];
type Crowd = readonly [EnemyTypeId, number][];

async function state(page: Page): Promise<SmokeState | undefined> {
  return page.evaluate(() => window.__smoke?.state());
}

async function waitFor(page: Page, check: (s: SmokeState) => boolean, what: string): Promise<void> {
  const deadline = Date.now() + SCREEN_TIMEOUT;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s && check(s)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Промо: ${what}`);
}

async function point(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('На странице нет canvas');
  return { x: box.x + (x / GAME_W) * box.width, y: box.y + (y / GAME_H) * box.height };
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  const at = await point(page, x, y);
  await page.touchscreen.tap(at.x, at.y);
}

/** Перетаскивание пальцем с человеческой скоростью: на видео должно быть видно, что кот летит в руке. */
async function drag(page: Page, from: [number, number], to: [number, number], hold?: () => Promise<void>): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, at?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: at ? [{ ...at, id: 1 }] : [] });
  const start = await point(page, ...from);
  const end = await point(page, ...to);
  await touch('touchStart', start);
  await page.waitForTimeout(150);
  const steps = 18;
  for (let step = 1; step <= steps; step++) {
    const k = step / steps;
    const ease = k * k * (3 - 2 * k);
    await touch('touchMove', { x: start.x + (end.x - start.x) * ease, y: start.y + (end.y - start.y) * ease });
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(250);
  if (hold) await hold();
  await touch('touchEnd');
  await cdp.detach();
}

type Recorder = { recorder: MediaRecorder; chunks: Blob[] };
type RecordingWindow = Window & { __promoRecorder?: Recorder };

/**
 * Запись прямо с холста игры (MediaRecorder): кадры в родном размере 360×640 и с высоким битрейтом.
 * Запись Playwright пережимает картинку так, что мелкий текст HUD расплывается.
 */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate((bitrate) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('На странице нет canvas');
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bitrate });
    const state: Recorder = { recorder, chunks: [] };
    recorder.ondataavailable = (event) => state.chunks.push(event.data);
    recorder.start(1000);
    (window as RecordingWindow).__promoRecorder = state;
  }, VIDEO_BITRATE);
}

/** Останавливает запись и сохраняет её файлом через загрузку браузера. */
async function stopRecording(page: Page, path: string): Promise<void> {
  const download = page.waitForEvent('download');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const state = (window as RecordingWindow).__promoRecorder;
        if (!state) throw new Error('Запись не начата');
        state.recorder.onstop = () => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob(state.chunks, { type: 'video/webm' }));
          link.download = 'raw.webm';
          link.click();
          resolve();
        };
        state.recorder.stop();
      }),
  );
  await (await download).saveAs(path);
}

async function openMenu(page: Page): Promise<void> {
  await page.goto('/?smoke&promo');
  await waitFor(page, (s) => s.scenes.includes(SceneKey.Menu) && !s.fading, 'игра не дошла до меню');
}

/** Бой на уровне `index` (с нуля), коты в клетках по порядку; `null` — клетка пустая. */
async function battle(page: Page, index: number, cats: (Cat | null)[]): Promise<[number, number][]> {
  const id = ((await page.evaluate(() => window.__smoke?.levelIds())) ?? [])[index];
  await page.evaluate((levelId) => window.__smoke?.startLevel(levelId), id);
  await waitFor(page, (s) => s.scenes.includes(SceneKey.UI) && s.hud !== null && !s.fading, `уровень ${id} не запустился`);
  await page.evaluate((list) => {
    list.forEach((cat, slot) => {
      // Вложено как за призывы, из которых кот слит: продать его можно не за ноль.
      if (cat) window.__smoke?.placeCat(slot, cat[0], cat[1], 10 * 2 ** (cat[1] - 1));
    });
  }, cats);
  return (await page.evaluate(() => window.__smoke?.slotCenters())) ?? [];
}

/**
 * Толпа на дороге: враги идут друг за другом от `from` с шагом `step` пикселей пути.
 * Здоровье — из списка, умноженное на `hp`: сильные коты должны бить толпу несколько секунд, а не сдувать её за один залп.
 */
async function crowd(page: Page, enemies: Crowd, from: number, step: number, hp: number): Promise<void> {
  await page.evaluate(
    ({ enemies, from, step, hp }) => {
      let distance = from;
      for (const [type, base] of enemies) {
        window.__smoke?.spawnEnemy(type, distance, base * hp);
        distance += step;
      }
    },
    { enemies, from, step, hp },
  );
}

/** Первая волна началась и надпись о ней погасла: в HUD — «Волна 1», а не «0» и не «Волна 1 скоро». */
async function waitWave(page: Page): Promise<void> {
  await waitFor(page, (s) => (s.hud?.wave ?? 0) >= 1, 'первая волна не началась');
  await page.waitForTimeout(WAVE_BANNER_MS);
}

/** Точка дороги, где в круге метеора больше всего врагов. */
async function crowdCenter(page: Page): Promise<[number, number]> {
  const points = (await page.evaluate(() => window.__smoke?.enemyPoints())) ?? [];
  if (points.length === 0) throw new Error('Промо: на дороге нет врагов для метеора');
  const near = ([x, y]: [number, number]) => points.filter(([ex, ey]) => Math.hypot(ex - x, ey - y) <= METEOR_RADIUS * 0.7).length;
  return points.reduce((best, p) => (near(p) > near(best) ? p : best));
}

/** Метеор: заряд полон, кнопка, прицел в гущу. */
async function meteor(page: Page): Promise<void> {
  await page.evaluate(() => window.__smoke?.chargeMeteor());
  await page.waitForTimeout(600);
  await tap(page, METEOR_X, CONTROLS_CENTER_Y);
  await page.waitForTimeout(450);
  await tap(page, ...(await crowdCenter(page)));
}

const ARMY: (Cat | null)[] = [
  ['fire', 5], ['steam', 5], ['water', 4],
  ['earth', 5], ['air', 4], ['lava', 6],
  ['storm', 5], ['fire', 4], ['ice', 5],
  ['water', 5], null, ['earth', 4],
];

const HYBRIDS: (Cat | null)[] = [
  ['steam', 6], ['lava', 6], ['storm', 6],
  ['ice', 6], ['swamp', 6], ['sand', 6],
  ['lava', 5], ['steam', 5], ['storm', 5],
  ['sand', 5], ['ice', 5], ['swamp', 5],
];

const KING_GUARD: (Cat | null)[] = [
  ['lava', 7], ['storm', 7], ['steam', 7],
  ['ice', 6], ['fire', 7], ['sand', 7],
  ['earth', 7], ['swamp', 6], ['lava', 6],
  ['storm', 6], ['water', 7], ['air', 6],
];

const MIXED: Crowd = [
  ['mouse', 60], ['rat', 140], ['shield', 90], ['mouse', 60], ['boots', 90], ['rat', 140],
  ['mouse', 60], ['fire', 100], ['shield', 90], ['mouse', 60], ['rat', 140], ['ninja', 70],
  ['mouse', 60], ['shaman', 90], ['mouse', 60], ['shield', 90],
];

test('скриншоты для каталога', async ({ page }, info) => {
  test.setTimeout(180_000);
  const shot = (name: string) => page.screenshot({ path: `${OUT}/screens/${info.project.name}/${name}.png` });
  await openMenu(page);

  // 1. Армия котов: почти полное поле, коты разных стихий и уровней бьют толпу.
  await battle(page, 4, ARMY);
  await waitWave(page);
  await crowd(page, MIXED, 30, 34, 12);
  await page.waitForTimeout(2500);
  await shot('1-army');

  // 2. Гибриды: все шесть, брызги пара и лавы, молнии по цепочке.
  await battle(page, 6, HYBRIDS);
  await waitWave(page);
  await crowd(page, MIXED, 30, 30, 25);
  await page.waitForTimeout(2500);
  await shot('2-hybrids');

  // 3. Метеор в гущу мышей.
  await battle(page, 8, ARMY);
  await waitWave(page);
  await crowd(page, [...MIXED, ...MIXED], 20, 18, 40);
  await page.waitForTimeout(2000);
  await meteor(page);
  await page.waitForTimeout(METEOR_BLAST_MS);
  await shot('3-meteor');

  // 4. Крысиный король со свитой против сильнейших котов.
  await battle(page, 9, KING_GUARD);
  await waitWave(page);
  // Король живучий: сильнейшие коты не должны снести его до снимка.
  // Свита — позади и впереди, чтобы не заслонять короля.
  await page.evaluate(() => window.__smoke?.spawnEnemy('king', 190, 200_000));
  await crowd(page, MIXED.slice(0, 6), 20, 24, 60);
  await crowd(page, MIXED.slice(6, 12), 300, 28, 60);
  await page.waitForTimeout(1200);
  await shot('4-king');

  // 5. Смешение стихий: огонь на воду — паровой кот, вспышка и «Открыт новый кот».
  const slots = await battle(page, 4, [['fire', 4], ['earth', 5], ['water', 4], ['air', 5], ['lava', 5], ['fire', 5], ['water', 5], null, ['earth', 4], ['storm', 5], ['air', 4], ['ice', 5]]);
  await waitWave(page);
  await crowd(page, MIXED, 30, 34, 12);
  await drag(page, slots[0], slots[2]);
  await page.waitForTimeout(RITUAL_MS + 250);
  await shot('5-hybrid');
});

test('видео: призыв, слияние, смешение, метеор', async ({ page }) => {
  test.setTimeout(180_000);
  await openMenu(page);
  // Пара для слияния (земля 2) и пара для смешения (огонь и вода 3) стоят заранее; призыв занимает свободные клетки.
  const slots = await battle(page, 4, [['fire', 3], null, ['water', 3], null, ['earth', 4], ['earth', 2], null, ['earth', 2], ['air', 3], ['lava', 4], null, ['steam', 3]]);
  await page.evaluate(() => window.__smoke?.addGold(200));
  await page.waitForTimeout(800);
  await startRecording(page);
  const start = Date.now();

  // Призыв: коты появляются в свободных клетках.
  for (let i = 0; i < 3; i++) {
    await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
    await page.waitForTimeout(900);
  }
  // Слияние: два одинаковых кота — один кот уровнем выше.
  await drag(page, slots[5], slots[7]);
  await page.waitForTimeout(1500);
  // Смешение стихий: огонь на воду — паровой кот, кольцо и вспышка.
  await drag(page, slots[0], slots[2]);
  await page.waitForTimeout(800);
  // Толпа подходит, пока идёт смешение.
  await crowd(page, MIXED, 20, 30, 3);
  await page.waitForTimeout(5200);
  // Метеор в гущу.
  await meteor(page);
  await page.waitForTimeout(3500);
  // Новая толпа, коты добивают.
  await crowd(page, MIXED.slice(0, 10), 20, 30, 3);
  await page.waitForTimeout(Math.max(0, VIDEO_MS - (Date.now() - start)));
  await stopRecording(page, `${OUT}/raw.webm`);
});
