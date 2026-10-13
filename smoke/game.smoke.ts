import { test, type Page } from '@playwright/test';
import { CONTROLS_H, CONTROLS_Y, GAME_H, GAME_W, gearButtonCenter, menuCardCenter, SUMMON_X } from '../src/layout';
import { SceneKey } from '../src/scenes/keys';
import type { SmokeState } from '../src/smoke';

const SHOTS = 'screenshots';
const CATS = 3;

const SCREEN_TIMEOUT = 10_000;
const SUMMON_TIMEOUT = 3_000;
const WAVE_TIMEOUT = 15_000;
/** Пауза перед снимком: анимация появления кота, выход мышей на видимую часть дороги. */
const SPAWN_SETTLE_MS = 400;
const WAVE_SETTLE_MS = 1500;

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

test('меню → первый уровень → снаряжение → три кота → первая волна', async ({ page }) => {
  await test.step('меню', async () => {
    await page.goto('/?smoke');
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `Игра не дошла до экрана «Меню» за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/01-menu.png` });
    checkConsole('меню');
  });

  await test.step('первый уровень', async () => {
    await tap(page, ...menuCardCenter(0));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Gear),
      (s) => `После нажатия на первый уровень игра не дошла до экрана снаряжения за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/02-gear.png` });
    checkConsole('снаряжение');
  });

  await test.step('«В бой»', async () => {
    await tap(page, ...gearButtonCenter('start'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Game) && s.scenes.includes(SceneKey.UI),
      (s) => `После нажатия «В бой» игра не дошла до игрового поля за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/03-game.png` });
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
      await page.screenshot({ path: `${SHOTS}/0${n + 3}-cat-${n}.png` });
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
    await page.screenshot({ path: `${SHOTS}/0${CATS + 4}-wave.png` });
    checkConsole('первая волна');
  });
});
