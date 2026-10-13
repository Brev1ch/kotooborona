import { test, type Page } from '@playwright/test';
import {
  bookBackCenter,
  chestTakeCenter,
  COIN_AD_X,
  CONTROLS_CENTER_Y,
  GAME_H,
  GAME_W,
  gearButtonCenter,
  menuBookCenter,
  menuCardCenter,
  menuChestCenter,
  menuSoundCenter,
  MIN_TOUCH,
  pauseButtonCenter,
  pauseMenuButtonCenter,
  resultAdCenter,
  resultButtonCenter,
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
/** Сколько смотрим на паузу, чтобы убедиться, что враги стоят. */
const PAUSE_HOLD_MS = 500;

/** Отступ касания от угла внутрь элемента: проверяем, что нажимается вся видимая площадь. */
const CORNER_INSET = 2;
/** Анимация нажатия на время сжимает элемент — ждём, пока он вернётся к своему размеру. */
const PRESS_SETTLE_MS = 250;

/** Экран итога проявляется, звёзды выскакивают по одной. */
const RESULT_SETTLE_MS = 1200;

const errors: string[] = [];

let shots = 0;

/** Имя снимка с порядковым номером: в папке они лежат по ходу проверки. */
function shot(name: string): string {
  shots++;
  return `${String(shots).padStart(2, '0')}-${name}.png`;
}

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
    // Пока экран гаснет или проявляется, он ещё не готов: ни к снимку, ни к нажатию.
    if (last && !last.fading && ready(last)) return;
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
  shots = 0;
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

/** Сохранение первой версии игры: до сундуков игроку было доступно всё снаряжение. */
const OLD_SAVE = { version: 1, stars: {}, gear: { staff: 'none', mantle: 'thrift', amulet: 'cry' }, book: [], sound: true };

/** Нажимаемый элемент с таким именем на текущем экране. */
async function target(page: Page, name: string): Promise<SmokeTarget> {
  const found = (await state(page))?.targets.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`На экране нет нажимаемого элемента «${name}»`);
  return found;
}

function center(t: SmokeTarget): [number, number] {
  return [t.x + t.width / 2, t.y + t.height / 2];
}

test('старое сохранение: меню → книга → снаряжение → бой → пауза → итоги боя', async ({ page }) => {
  // Игрок с сохранением версии 1: оно должно прочитаться, а всё снаряжение — остаться доступным.
  await page.addInitScript((save) => localStorage.setItem('koto_save', JSON.stringify(save)), OLD_SAVE);

  await test.step('меню', async () => {
    await page.goto('/?smoke');
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `Игра не дошла до экрана «Меню» за ${SCREEN_TIMEOUT / 1000} с: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/${shot('menu')}` });
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
    await page.screenshot({ path: `${SHOTS}/${shot('book')}` });
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
    await page.screenshot({ path: `${SHOTS}/${shot('gear')}` });
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
    await page.screenshot({ path: `${SHOTS}/${shot('game')}` });
    await checkTouchSizes(page, 'игровое поле');
    checkConsole('игровое поле');
  });

  for (let n = 1; n <= CATS; n++) {
    await test.step(`призыв кота ${n}`, async () => {
      await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.cats === n,
        (s) => `После нажатия «Призвать» котов на поле: ${s?.cats ?? 0}, ожидалось ${n} (монет: ${s?.hud?.gold ?? '?'})`,
      );
      await page.waitForTimeout(SPAWN_SETTLE_MS);
      await page.screenshot({ path: `${SHOTS}/${shot(`cat-${n}`)}` });
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
    await page.screenshot({ path: `${SHOTS}/${shot('wave')}` });
    checkConsole('первая волна');
  });

  await test.step('монеты за рекламу', async () => {
    const before = (await state(page))?.hud?.gold ?? 0;
    await tap(page, COIN_AD_X, CONTROLS_CENTER_Y);
    // Заглушка площадки засчитывает ролик сразу: монеты приходят, кнопка уходит отдыхать.
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => (s.hud?.gold ?? 0) >= before + 60,
      (s) => `Ролик не принёс монет: было ${before}, стало ${s?.hud?.gold ?? '?'}`,
    );
    await page.waitForTimeout(PRESS_SETTLE_MS);
    const after = (await state(page))?.hud?.gold ?? 0;
    await tap(page, COIN_AD_X, CONTROLS_CENTER_Y);
    await page.waitForTimeout(PRESS_SETTLE_MS);
    const again = (await state(page))?.hud?.gold ?? 0;
    // За это время монеты могли прийти и за мышей, но не шестьдесят разом.
    if (again >= after + 60) throw new Error(`Кнопка рекламы сработала дважды подряд: ${after} → ${again}`);
    await page.screenshot({ path: `${SHOTS}/${shot('coin-ad')}` });
    checkConsole('монеты за рекламу');
  });

  /** На паузе враги стоят; «Продолжить» возвращает в бой. */
  async function checkPausedAndResume(step: string, shot?: string): Promise<void> {
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.paused,
      () => `Бой не встал на паузу (${step})`,
    );
    const before = await state(page);
    await page.waitForTimeout(PAUSE_HOLD_MS);
    const after = await state(page);
    if (!before || !after || before.enemies === 0 || after.march !== before.march) {
      throw new Error(`На паузе враги продолжают идти (${step}): путь ${before?.march} → ${after?.march}`);
    }
    if (shot) await page.screenshot({ path: `${SHOTS}/${shot}` });
    await checkTouchSizes(page, step);

    await tap(page, ...pauseMenuButtonCenter(0));
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => !s.paused && s.march > after.march,
      () => `После «Продолжить» бой не пошёл дальше (${step})`,
    );
    checkConsole(step);
  }

  await test.step('пауза', async () => {
    await tap(page, ...pauseButtonCenter());
    await checkPausedAndResume('меню паузы', shot('pause'));
  });

  await test.step('пауза после сворачивания', async () => {
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await setHidden(false);
    await checkPausedAndResume('возврат после сворачивания');
  });

  await test.step('поражение и второй шанс', async () => {
    await page.evaluate(() => window.__smoke?.lose());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === 'lose',
      () => 'После потери всех жизней не появился экран поражения',
    );
    await page.waitForTimeout(RESULT_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/${shot('lose')}` });
    await checkTouchSizes(page, 'поражение');

    await tap(page, ...resultAdCenter());
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.result === null && (s.hud?.lives ?? 0) > 0,
      (s) => `«Второй шанс» не вернул в бой: экран итога «${s?.result}», жизней ${s?.hud?.lives ?? '?'}`,
    );
    checkConsole('второй шанс');

    // Шанс один на уровень: после второго поражения кнопки нет, нажатие на её место ничего не даёт.
    await page.evaluate(() => window.__smoke?.lose());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === 'lose',
      () => 'После второго поражения не появился экран итога',
    );
    await page.waitForTimeout(RESULT_SETTLE_MS);
    await tap(page, ...resultAdCenter());
    await page.waitForTimeout(PRESS_SETTLE_MS);
    if ((await state(page))?.result !== 'lose') throw new Error('«Второй шанс» сработал второй раз за уровень');
    await page.screenshot({ path: `${SHOTS}/${shot('lose-again')}` });

    await tap(page, ...resultButtonCenter('right'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === null && s.scenes.includes(SceneKey.UI) && (s.hud?.wave ?? 1) === 0,
      (s) => `«Ещё раз» не перезапустило уровень: ${scenesText(s)}`,
    );
    checkConsole('ещё раз');
  });

  await test.step('победа и удвоение награды', async () => {
    const before = (await state(page))?.fish ?? 0;
    await page.evaluate(() => window.__smoke?.win());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === 'win',
      () => 'Не появился экран победы',
    );
    await page.waitForTimeout(RESULT_SETTLE_MS);
    const reward = ((await state(page))?.fish ?? 0) - before;
    if (reward <= 0) throw new Error(`За победу не выданы рыбки: было ${before}, стало ${before + reward}`);
    await page.screenshot({ path: `${SHOTS}/${shot('win')}` });
    await checkTouchSizes(page, 'победа');

    await tap(page, ...resultAdCenter());
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.fish === before + reward * 2,
      (s) => `Ролик не удвоил награду: ожидалось ${before + reward * 2} рыбок, стало ${s?.fish ?? '?'}`,
    );
    await page.waitForTimeout(PRESS_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/${shot('win-doubled')}` });
    checkConsole('удвоение награды');

    await tap(page, ...resultButtonCenter('left'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `«В меню» с экрана победы не вернуло в меню: ${scenesText(s)}`,
    );
    await page.screenshot({ path: `${SHOTS}/${shot('menu-after')}` });
    checkConsole('меню после победы');
  });
});

test('новый игрок: закрытое снаряжение → победа → сундук → прокачка', async ({ page }) => {
  await test.step('меню и экран снаряжения', async () => {
    await page.goto('/?smoke');
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `Игра не дошла до меню: ${scenesText(s)}`,
    );
    await tap(page, ...menuCardCenter(0));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Gear),
      (s) => `Игра не дошла до экрана снаряжения: ${scenesText(s)}`,
    );
    await checkTouchSizes(page, 'снаряжение нового игрока');

    // Предмета из сундука у нового игрока нет: нажатие показывает, что он даёт, но не надевает.
    await tap(page, ...center(await target(page, 'gear:staff:fire')));
    await page.waitForTimeout(PRESS_SETTLE_MS);
    const after = await state(page);
    if (after?.gear.staff !== 'none') throw new Error(`Закрытый предмет наделся: в слоте посоха «${after?.gear.staff}»`);
    await page.screenshot({ path: `${SHOTS}/${shot('new-gear-locked')}` });

    // Рыбок ещё нет: прокачка недоступна.
    await tap(page, ...center(await target(page, 'upgrade:mantle')));
    await page.waitForTimeout(PRESS_SETTLE_MS);
    if ((await state(page))?.gearLevels.mantle !== 1) throw new Error('Предмет прокачался без рыбок');
    checkConsole('снаряжение нового игрока');
  });

  await test.step('победа на три звезды', async () => {
    await tap(page, ...gearButtonCenter('start'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.UI),
      (s) => `Бой не начался: ${scenesText(s)}`,
    );
    await page.evaluate(() => window.__smoke?.win());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === 'win',
      () => 'Не появился экран победы',
    );
    await page.waitForTimeout(RESULT_SETTLE_MS);
    await tap(page, ...resultAdCenter());
    await page.waitForTimeout(PRESS_SETTLE_MS);
    await tap(page, ...resultButtonCenter('left'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `Игра не вернулась в меню: ${scenesText(s)}`,
    );
    checkConsole('победа');
  });

  await test.step('сундук', async () => {
    const before = await state(page);
    await page.screenshot({ path: `${SHOTS}/${shot('new-chest-ready')}` });
    await checkTouchSizes(page, 'меню с сундуком');

    await tap(page, ...menuChestCenter());
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.chests === 1 && s.fish > (before?.fish ?? 0),
      (s) => `Сундук не открылся: открыто ${s?.chests ?? '?'}, рыбок ${s?.fish ?? '?'}`,
    );
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/${shot('new-chest-loot')}` });
    await checkTouchSizes(page, 'окно сундука');

    await tap(page, ...chestTakeCenter());
    await page.waitForTimeout(PRESS_SETTLE_MS);
    // Окно закрыто: уровни снова нажимаются.
    await tap(page, ...menuCardCenter(0));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Gear),
      (s) => `После «Забрать» уровень не открылся: ${scenesText(s)}`,
    );
    checkConsole('сундук');
  });

  await test.step('прокачка', async () => {
    const before = await state(page);
    await tap(page, ...center(await target(page, 'upgrade:mantle')));
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.gearLevels.mantle === 2 && s.fish < (before?.fish ?? 0),
      (s) => `Мантия не прокачалась: уровень ${s?.gearLevels.mantle ?? '?'}, рыбок ${before?.fish} → ${s?.fish ?? '?'}`,
    );
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/${shot('new-gear-upgraded')}` });
    await checkTouchSizes(page, 'снаряжение после прокачки');
    checkConsole('прокачка');
  });
});
