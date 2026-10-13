import { test, type Page } from '@playwright/test';
import {
  bookBackCenter,
  CONTROLS_H,
  CONTROLS_Y,
  GAME_H,
  GAME_W,
  gearButtonCenter,
  menuBookCenter,
  menuCardCenter,
  menuSoundCenter,
  MIN_TOUCH,
  SUMMON_X,
} from '../src/layout';
import { SceneKey } from '../src/scenes/keys';
import type { SmokeState, SmokeTarget } from '../src/smoke';
import { GEAR_SLOTS } from '../src/systems/Progress';

const SHOTS = 'screenshots';
const CATS = 3;

const SCREEN_TIMEOUT = 10_000;
const SUMMON_TIMEOUT = 3_000;
const WAVE_TIMEOUT = 15_000;
/** Пауза перед снимком: анимация появления кота, выход мышей на видимую часть дороги. */
const SPAWN_SETTLE_MS = 400;
const WAVE_SETTLE_MS = 1500;

/** Отступ касания от угла внутрь элемента: проверяем, что нажимается вся видимая площадь. */
const CORNER_INSET = 2;
/** Анимация нажатия на время сжимает элемент — ждём, пока он вернётся к своему размеру. */
const PRESS_SETTLE_MS = 250;

const errors: string[] = [];

function state(page: Page): Promise<SmokeState | null> {
  return page.evaluate(() => window.__smoke?.state() ?? null);
}

/** Ждёт, пока состояние игры не подойдёт под условие; иначе падает с сообщением и последним состоянием. */
async function waitFor(
  page: Page,
  timeout: number,
  ready: (s: SmokeState) => boolean,
  message: (s: SmokeState | null) => string,
): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: SmokeState | null = null;
  while (Date.now() < deadline) {
    last = await state(page);
    if (last && ready(last)) return;
    // Ошибка в консоли обычно и есть причина, по которой экран не появился.
    if (errors.length > 0) break;
    await page.waitForTimeout(100);
  }
  checkConsole(message(last));
  throw new Error(message(last));
}

function checkConsole(step: string): void {
  if (errors.length === 0) return;
  throw new Error(`Ошибки в консоли (${step}):\n${errors.map((e) => `  • ${e}`).join('\n')}`);
}

/** Касание в логических координатах игры (360×640). */
async function tap(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('На странице нет canvas: игра не запустилась');
  await page.touchscreen.tap(box.x + (x / GAME_W) * box.width, box.y + (y / GAME_H) * box.height);
}

function targetText(target: SmokeTarget): string {
  const { name, x, y, width, height } = target;
  return `«${name || 'без имени'}» ${Math.round(width)}×${Math.round(height)} в точке (${Math.round(x)}, ${Math.round(y)})`;
}

/** Все нажимаемые элементы экрана должны быть не меньше MIN_TOUCH по обеим сторонам. */
async function checkTouchSizes(page: Page, step: string): Promise<void> {
  await page.waitForTimeout(PRESS_SETTLE_MS);
  const targets = (await state(page))?.targets ?? [];
  if (targets.length === 0) throw new Error(`На экране «${step}» нет ни одного нажимаемого элемента`);
  // Полпикселя запаса на дробные координаты.
  const small = targets.filter((target) => Math.min(target.width, target.height) < MIN_TOUCH - 0.5);
  if (small.length === 0) return;
  throw new Error(
    `Нажимаемые элементы меньше ${MIN_TOUCH}×${MIN_TOUCH} (${step}):\n${small.map((s) => `  • ${targetText(s)}`).join('\n')}`,
  );
}

/** Точка у самого угла элемента; `right` и `bottom` выбирают угол. */
function corner(target: SmokeTarget, right: boolean, bottom: boolean): [number, number] {
  return [
    right ? target.x + target.width - CORNER_INSET : target.x + CORNER_INSET,
    bottom ? target.y + target.height - CORNER_INSET : target.y + CORNER_INSET,
  ];
}

function scenesText(s: SmokeState | null): string {
  if (!s) return 'зонд window.__smoke не появился — игра не запустилась';
  return `активные сцены: [${s.scenes.join(', ')}]`;
}

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const { url } = msg.location();
    errors.push(url ? `${msg.text()} (${url})` : msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: `${SHOTS}/failure.png` });
  }
});

test('меню → книга котов → первый уровень → снаряжение → три кота → первая волна', async ({ page }) => {
  await test.step('меню', async () => {
    await page.goto('/?smoke');
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `Игра не дошла до экрана «Меню» за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/01-menu.png` });
    await checkTouchSizes(page, 'меню');
    checkConsole('меню');
  });

  await test.step('кнопка звука', async () => {
    for (const expected of [false, true]) {
      await tap(page, ...menuSoundCenter());
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.sound === expected,
        () => `Нажатие на кнопку звука не ${expected ? 'включило' : 'выключило'} звук`,
      );
      await page.waitForTimeout(PRESS_SETTLE_MS);
    }
    checkConsole('кнопка звука');
  });

  await test.step('книга котов', async () => {
    await tap(page, ...menuBookCenter());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Book),
      (s) => `После нажатия «Книга котов» игра не дошла до книги за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/02-book.png` });
    await checkTouchSizes(page, 'книга котов');
    checkConsole('книга котов');

    await tap(page, ...bookBackCenter());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `После нажатия «Назад» в книге игра не вернулась в меню за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    checkConsole('возврат из книги');
  });

  await test.step('первый уровень', async () => {
    await tap(page, ...menuCardCenter(0));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Gear),
      (s) => `После нажатия на первый уровень игра не дошла до экрана снаряжения за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await checkTouchSizes(page, 'снаряжение');
    checkConsole('снаряжение');
  });

  for (const slot of GEAR_SLOTS) {
    await test.step(`снаряжение: ${slot}`, async () => {
      const before = await state(page);
      const prefix = `gear:${slot}:`;
      const chips = (before?.targets ?? []).filter((target) => target.name.startsWith(prefix));
      if (chips.length < 2) throw new Error(`В слоте ${slot} плашек: ${chips.length}, выбирать не из чего`);

      // Нажимаем у самых углов: ненадетый предмет, обратно надетый, затем последний в слоте.
      const worn = chips.find((chip) => chip.name === prefix + before?.gear[slot]) ?? chips[0];
      const other = chips.find((chip) => chip !== worn) ?? chips[1];
      const last = chips[chips.length - 1] === worn ? other : chips[chips.length - 1];
      const taps: [SmokeTarget, boolean, boolean][] = [
        [other, false, false],
        [worn, true, true],
        [last, true, false],
        [worn, false, true],
        [last, false, false],
      ];
      for (const [chip, right, bottom] of taps) {
        const id = chip.name.slice(prefix.length);
        const [x, y] = corner(chip, right, bottom);
        await tap(page, x, y);
        await waitFor(
          page,
          SUMMON_TIMEOUT,
          (s) => s.gear[slot] === id,
          (s) =>
            `Нажатие в точку (${Math.round(x)}, ${Math.round(y)}) у угла плашки ${targetText(chip)} не надело предмет: ` +
            `в слоте ${slot} остался «${s?.gear[slot] ?? '?'}»`,
        );
        await page.waitForTimeout(PRESS_SETTLE_MS);
      }
      checkConsole(`снаряжение: ${slot}`);
    });
  }

  await test.step('снаряжение выбрано', async () => {
    await page.screenshot({ path: `${SHOTS}/03-gear.png` });
    checkConsole('снаряжение выбрано');
  });

  await test.step('«В бой»', async () => {
    await tap(page, ...gearButtonCenter('start'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Game) && s.scenes.includes(SceneKey.UI),
      (s) => `После нажатия «В бой» игра не дошла до игрового поля за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/04-game.png` });
    await checkTouchSizes(page, 'игровое поле');
    checkConsole('игровое поле');
  });

  for (let n = 1; n <= CATS; n++) {
    await test.step(`призыв кота ${n}`, async () => {
      await tap(page, SUMMON_X, CONTROLS_Y + CONTROLS_H / 2);
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.cats === n,
        (s) => `После нажатия «Призвать» котов на поле: ${s?.cats ?? 0}, ожидалось ${n} (монет: ${s?.hud?.gold ?? '?'})`,
      );
      await page.waitForTimeout(SPAWN_SETTLE_MS);
      await page.screenshot({ path: `${SHOTS}/0${n + 4}-cat-${n}.png` });
      checkConsole(`призыв кота ${n}`);
    });
  }

  await test.step('первая волна', async () => {
    await waitFor(
      page,
      WAVE_TIMEOUT,
      (s) => (s.hud?.wave ?? 0) >= 1 && s.enemies >= 1,
      (s) => `Волна не началась за ${WAVE_TIMEOUT / 1000} с (волна ${s?.hud?.wave ?? 0}, врагов ${s?.enemies ?? 0})`,
    );
    await page.waitForTimeout(WAVE_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/0${CATS + 5}-wave.png` });
    checkConsole('первая волна');
  });
});
