import { test, type Page } from '@playwright/test';
import {
  bookBackCenter,
  chestTakeCenter,
  COIN_AD_X,
  CONTROLS_CENTER_Y,
  GAME_H,
  BUILD_X,
  buildRowCenter,
  GAME_W,
  gearButtonCenter,
  HUD_H,
  menuBookCenter,
  menuCardCenter,
  menuChestCenter,
  menuSoundCenter,
  METEOR_X,
  MIN_TOUCH,
  pauseButtonCenter,
  pauseMenuButtonCenter,
  resultAdCenter,
  resultButtonCenter,
  speedButtonCenter,
  storySkipCenter,
  SUMMON_X,
} from '../src/layout';
import { SceneKey } from '../src/scenes/keys';
import type { SmokeState, SmokeTarget } from '../src/smoke';
import { GEAR_SLOTS } from '../src/systems/Progress';

/** Куда складываются снимки: у русской локали — в корень, у остальных — в свою папку. */
let SHOTS = 'screenshots';
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
  /** Не ждать, пока экран проявится: так его видит игрок, который жмёт сразу. */
  early = false,
): Promise<void> {
  const deadline = Date.now() + timeout;
  let last: SmokeState | null = null;
  while (Date.now() < deadline) {
    last = await state(page);
    // Пока экран гаснет или проявляется, он ещё не готов: ни к снимку, ни к нажатию.
    if (last && (early || !last.fading) && ready(last)) return;
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

/** Все нажимаемые элементы экрана должны быть не меньше MIN_TOUCH по обеим сторонам, а надписи — помещаться. */
async function checkTouchSizes(page: Page, step: string): Promise<void> {
  await page.waitForTimeout(PRESS_SETTLE_MS);
  const targets = (await state(page))?.targets ?? [];
  if (targets.length === 0) throw new Error(`На экране «${step}» нет ни одного нажимаемого элемента`);
  // Полпикселя запаса на дробные координаты.
  const small = targets.filter((target) => Math.min(target.width, target.height) < MIN_TOUCH - 0.5);
  if (small.length > 0) {
    throw new Error(
      `Нажимаемые элементы меньше ${MIN_TOUCH}×${MIN_TOUCH} (${step}):\n${small.map((s) => `  • ${targetText(s)}`).join('\n')}`,
    );
  }
  await checkTexts(page, step);
}

/** Надписи экрана помещаются в свои кнопки, не выходят за край и не наезжают друг на друга. */
async function checkTexts(page: Page, step: string): Promise<void> {
  const issues = (await page.evaluate(() => window.__smoke?.textIssues())) ?? [];
  if (issues.length === 0) return;
  throw new Error(`Текст не помещается (${step}):\n${[...new Set(issues)].map((issue) => `  • ${issue}`).join('\n')}`);
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

test.beforeEach(({ page }, testInfo) => {
  errors.length = 0;
  shots = 0;
  const locale = testInfo.project.name;
  SHOTS = locale === 'ru' ? 'screenshots' : `screenshots/${locale}`;
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

  await test.step('сценка перед главой', async () => {
    await tap(page, ...gearButtonCenter('start'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.story?.line === 1,
      (s) => `Перед первым уровнем не появилась сценка: ${scenesText(s)}`,
    );
    await checkTouchSizes(page, 'сценка');
    const total = (await state(page))?.story?.total ?? 0;
    // Касание в любом месте листает реплики; после последней начинается бой.
    for (let line = 1; line <= total; line++) {
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.story?.line === line,
        (s) => `Сценка не перешла к реплике ${line}: на экране ${s?.story?.line ?? 'нет сценки'}`,
      );
      await page.waitForTimeout(PRESS_SETTLE_MS);
      await page.screenshot({ path: `${SHOTS}/${shot(`story-${line}`)}` });
      await tap(page, GAME_W / 2, GAME_H / 2);
    }
    checkConsole('сценка перед главой');
  });

  await test.step('бой начался', async () => {
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

  await test.step('призыв сверх лимита волны', async () => {
    // Монет после ролика хватает: жмём «Призвать», пока призывы волны не кончатся и цена не вырастет.
    const TAPS = 8;
    for (let n = 0; n < TAPS && ((await state(page))?.hud?.overLimitMult ?? 1) === 1; n++) {
      await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
      await page.waitForTimeout(PRESS_SETTLE_MS);
    }
    const hud = (await state(page))?.hud;
    if (!hud || hud.overLimitMult <= 1 || hud.summonsLeft !== 0 || hud.summonCost <= 10) {
      throw new Error(
        `Лимит призывов не сработал: осталось ${hud?.summonsLeft ?? '?'} из ${hud?.summonLimit ?? '?'}, цена ${hud?.summonCost ?? '?'}`,
      );
    }
    await page.screenshot({ path: `${SHOTS}/${shot('summon-over-limit')}` });
    await checkTouchSizes(page, 'призыв сверх лимита');
    checkConsole('призыв сверх лимита волны');
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

  await test.step('ускорение боя', async () => {
    const speed = async (): Promise<number> => (await state(page))?.hud?.speed ?? 0;
    if ((await speed()) !== 1) throw new Error(`Бой начался не с обычной скорости: ×${await speed()}`);
    // Туда и обратно: кнопка — переключатель.
    for (const expected of [2, 1, 2]) {
      await tap(page, ...speedButtonCenter());
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.hud?.speed === expected,
        (s) => `Кнопка скорости не переключила бой на ×${expected}: сейчас ×${s?.hud?.speed ?? '?'}`,
      );
    }
    await page.screenshot({ path: `${SHOTS}/${shot('speed')}` });
    await checkTouchSizes(page, 'ускоренный бой');
    checkConsole('ускорение боя');
  });

  await test.step('пауза', async () => {
    await tap(page, ...pauseButtonCenter());
    // Бой ускорен: пауза должна останавливать его так же, а после неё скорость остаётся.
    await checkPausedAndResume('меню паузы', shot('pause'));
    if ((await state(page))?.hud?.speed !== 2) throw new Error('После паузы скорость боя сбросилась');
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
    if ((await state(page))?.hud?.speed !== 2) throw new Error('После «Второго шанса» скорость боя сбросилась: бой тот же');
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
    // Скорость держится до конца боя, новый бой идёт с обычной.
    if ((await state(page))?.hud?.speed !== 1) throw new Error('Новый бой начался ускоренным');
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
      (s) => s.story !== null,
      (s) => `Перед первым уровнем не появилась сценка: ${scenesText(s)}`,
    );
    // «Пропустить» сразу ведёт в бой.
    await tap(page, ...storySkipCenter());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.UI),
      (s) => `После «Пропустить» бой не начался: ${scenesText(s)}`,
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

/**
 * Касание в логических координатах: нажать, провести, отпустить — как палец, который тащит кота.
 * `beforeRelease` вызывается, пока палец ещё держит кота над целью.
 */
async function drag(page: Page, from: [number, number], to: [number, number], beforeRelease?: () => Promise<void>): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('На странице нет canvas');
  const point = ([x, y]: [number, number]) => ({ x: box.x + (x / GAME_W) * box.width, y: box.y + (y / GAME_H) * box.height });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, at?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: at ? [{ ...at, id: 1 }] : [] });
  const start = point(from);
  const end = point(to);
  await touch('touchStart', start);
  for (let step = 1; step <= 5; step++) {
    await touch('touchMove', { x: start.x + ((end.x - start.x) * step) / 5, y: start.y + ((end.y - start.y) * step) / 5 });
    await page.waitForTimeout(30);
  }
  await beforeRelease?.();
  await touch('touchEnd');
}

/** Сколько ждать, чтобы убедиться, что подсказка не появилась снова: дольше её задержки. */
const TUTORIAL_GONE_MS = 1800;

/** Точка зоны продажи: левая часть нижней полосы, чтобы кот в руке не закрывал надпись «Продать». */
const SELL_POINT: [number, number] = [GAME_W / 6, CONTROLS_CENTER_Y];
/** Первый уровень, на котором открыты строения (номер с нуля). */
const FIRST_BUILD_LEVEL = 3;
const BUILD_KINDS = 3;

/** Стройка на идущем уровне: окно, постройка лавки, два улучшения, продажа строения. */
async function checkBuildings(page: Page, id: string): Promise<void> {
  const rows = (expected: number, message: string): Promise<void> =>
    waitFor(page, SUMMON_TIMEOUT, (s) => s.buildRows === expected, (s) => `${id}: ${message} (строк в окне: ${s?.buildRows ?? '?'})`);
  const gold = async (): Promise<number> => (await state(page))?.hud?.gold ?? 0;

  await page.evaluate(() => window.__smoke?.addGold(300));
  await tap(page, BUILD_X, CONTROLS_CENTER_Y);
  await rows(BUILD_KINDS, 'окно стройки не открылось');
  await page.screenshot({ path: `${SHOTS}/build-1-panel.png` });
  await checkTouchSizes(page, 'окно стройки');

  const before = await gold();
  await tap(page, ...buildRowCenter(0, BUILD_KINDS));
  await waitFor(
    page,
    SUMMON_TIMEOUT,
    (s) => s.buildings === 1 && s.buildRows === 0 && (s.hud?.gold ?? 0) < before,
    (s) => `${id}: лавка не построена (строений ${s?.buildings ?? 0}, монет ${s?.hud?.gold ?? '?'}, было ${before})`,
  );

  const [slot] = (await page.evaluate(() => window.__smoke?.buildingSlots())) ?? [];
  const centers = (await page.evaluate(() => window.__smoke?.slotCenters())) ?? [];
  await page.waitForTimeout(SPAWN_SETTLE_MS);
  await tap(page, ...centers[slot]);
  await rows(1, 'нажатие на строение не открыло улучшение');
  await page.screenshot({ path: `${SHOTS}/build-2-upgrade.png` });
  await checkTouchSizes(page, 'окно улучшения');

  // Два улучшения подряд: окно остаётся открытым, после второго улучшать некуда.
  for (let level = 2; level <= 3; level++) {
    const had = await gold();
    await tap(page, ...buildRowCenter(0, 1));
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => (s.hud?.gold ?? 0) < had && s.buildRows === 1,
      (s) => `${id}: улучшение до уровня ${level} не куплено (монет ${s?.hud?.gold ?? '?'}, было ${had})`,
    );
    await page.waitForTimeout(PRESS_SETTLE_MS);
  }
  const maxed = await gold();
  await tap(page, ...buildRowCenter(0, 1));
  await page.waitForTimeout(PRESS_SETTLE_MS);
  if ((await gold()) < maxed) throw new Error(`${id}: строение последнего уровня улучшилось ещё раз`);
  await page.screenshot({ path: `${SHOTS}/build-3-max.png` });
  await checkTexts(page, 'строение последнего уровня');

  // Нажатие мимо окна его закрывает.
  await tap(page, GAME_W / 2, HUD_H + 20);
  await rows(0, 'окно улучшения не закрылось нажатием мимо');

  const sold = await gold();
  await drag(page, centers[slot], SELL_POINT, async () => {
    await page.waitForTimeout(PRESS_SETTLE_MS);
    if (!(await state(page))?.sellZone) throw new Error(`${id}: строение над нижней полосой, а зоны продажи нет`);
    await page.screenshot({ path: `${SHOTS}/build-4-sell.png` });
    await checkTexts(page, 'строение над зоной продажи');
  });
  await waitFor(
    page,
    SUMMON_TIMEOUT,
    (s) => s.buildings === 0 && (s.hud?.gold ?? 0) > sold && s.sellZone === null,
    (s) => `${id}: строение не продано (строений ${s?.buildings ?? '?'}, монет ${s?.hud?.gold ?? '?'}, было ${sold})`,
  );
}

test('все уровни главы запускаются, кот продаётся; на четвёртом — стройка, на последнем выходит король', async ({ page }) => {
  await page.goto('/?smoke');
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.scenes.includes(SceneKey.Menu),
    (s) => `Игра не дошла до меню: ${scenesText(s)}`,
  );
  const ids = (await page.evaluate(() => window.__smoke?.levelIds())) ?? [];
  if (ids.length !== 10) throw new Error(`В главе должно быть 10 уровней, а описано ${ids.length}`);

  for (const [index, id] of ids.entries()) {
    await test.step(`уровень ${index + 1}: ${id}`, async () => {
      await page.evaluate((levelId) => window.__smoke?.startLevel(levelId), id);
      await waitFor(
        page,
        SCREEN_TIMEOUT,
        (s) => s.scenes.includes(SceneKey.UI) && s.hud !== null,
        (s) => `Уровень ${id} не запустился: ${scenesText(s)}`,
      );
      // Коты на поле показывают, где клетки, а первая волна — где дорога.
      for (let n = 0; n < CATS; n++) await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.cats === CATS,
        (s) => `На уровне ${id} котов ${s?.cats ?? 0}, ожидалось ${CATS}`,
      );

      // Одного кота — на продажу: пока он в руке, нижняя полоса целиком становится зоной продажи.
      const number = String(index + 1).padStart(2, '0');
      const gold = (await state(page))?.hud?.gold ?? 0;
      const [slot] = (await page.evaluate(() => window.__smoke?.catSlots())) ?? [];
      const centers = (await page.evaluate(() => window.__smoke?.slotCenters())) ?? [];
      await drag(page, centers[slot], SELL_POINT, async () => {
        await page.waitForTimeout(PRESS_SETTLE_MS);
        const zone = (await state(page))?.sellZone;
        if (!zone?.includes('5')) throw new Error(`Уровень ${id}: кот над нижней полосой, а на зоне продажи «${zone ?? 'ничего'}»`);
        if (!(await state(page))?.ghost) throw new Error(`Уровень ${id}: кот над зоной продажи не нарисован поверх неё`);
        await page.screenshot({ path: `${SHOTS}/level-${number}-sell.png` });
        await checkTexts(page, `уровень ${id}, кот над зоной продажи`);
      });
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.cats === CATS - 1 && (s.hud?.gold ?? 0) >= gold + 5 && s.sellZone === null && !s.ghost,
        (s) => `На уровне ${id} кот не продан: котов ${s?.cats ?? 0}, монет ${s?.hud?.gold ?? '?'} (было ${gold}), зона «${s?.sellZone ?? ''}»`,
      );
      // Кот, которого подняли и вернули в клетку, остаётся на поле, а кнопки возвращаются.
      const [kept] = (await page.evaluate(() => window.__smoke?.catSlots())) ?? [];
      await drag(page, centers[kept], [centers[kept][0], centers[kept][1] - 4]);
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.cats === CATS - 1 && s.sellZone === null && !s.ghost,
        (s) => `На уровне ${id} кот, возвращённый в клетку, пропал или кнопки не вернулись (котов ${s?.cats ?? 0})`,
      );

      await waitFor(
        page,
        WAVE_TIMEOUT,
        (s) => s.enemies >= 3,
        (s) => `На уровне ${id} не вышла первая волна (врагов ${s?.enemies ?? 0})`,
      );
      await page.waitForTimeout(WAVE_SETTLE_MS);
      if (index === ids.length - 1) {
        const before = (await state(page))?.enemies ?? 0;
        await page.evaluate(() => window.__smoke?.spawnKing());
        await waitFor(
          page,
          SUMMON_TIMEOUT,
          (s) => s.enemies >= before + 3,
          (s) => `Король не призвал подмогу: врагов было ${before}, стало ${s?.enemies ?? '?'}`,
        );
        await page.waitForTimeout(SPAWN_SETTLE_MS);
      }
      await page.screenshot({ path: `${SHOTS}/level-${number}-${id}.png` });
      if (index === FIRST_BUILD_LEVEL) await checkBuildings(page, id);
      checkConsole(`уровень ${id}`);
    });
  }

  await test.step('сценка перед королём', async () => {
    const last = ids[ids.length - 1];
    await page.evaluate((levelId) => window.__smoke?.startStory(levelId, 'king'), last);
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.story?.line === 1,
      (s) => `Сценка перед королём не появилась: ${scenesText(s)}`,
    );
    const total = (await state(page))?.story?.total ?? 0;
    for (let line = 1; line <= total; line++) {
      await waitFor(
        page,
        SUMMON_TIMEOUT,
        (s) => s.story?.line === line,
        () => `Сценка не перешла к реплике ${line}`,
      );
      await page.waitForTimeout(PRESS_SETTLE_MS);
      await page.screenshot({ path: `${SHOTS}/story-king-${line}.png` });
      await tap(page, GAME_W / 2, GAME_H / 2);
    }
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.UI) && s.hud?.totalWaves === 9,
      (s) => `После сценки не начался бой с королём: ${scenesText(s)}`,
    );
    checkConsole('сценка перед королём');
  });
});

test('обучение: призыв → слияние → лимит → продажа → гибрид → метеор → стройка; на пройденном уровне подсказок нет', async ({ page }) => {
  /** Подсказка появляется с задержкой и после неё должна быть именно такой. */
  const expectHint = (step: string | null, message: string): Promise<void> =>
    waitFor(
      page,
      WAVE_TIMEOUT,
      (s) => s.tutorial === step,
      (s) => `${message}: на экране подсказка «${s?.tutorial ?? 'нет'}»`,
    );
  const startLevel = async (id?: string): Promise<void> => {
    await page.evaluate((levelId) => window.__smoke?.startLevel(levelId), id);
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.UI) && s.hud?.wave === 0,
      (s) => `Уровень ${id ?? 'первый'} не запустился: ${scenesText(s)}`,
    );
  };
  await page.goto('/?smoke');
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.scenes.includes(SceneKey.Menu),
    (s) => `Игра не дошла до меню: ${scenesText(s)}`,
  );
  const ids = (await page.evaluate(() => window.__smoke?.levelIds())) ?? [];

  await test.step('уровень 1: призыв', async () => {
    await startLevel(ids[0]);
    await expectHint('summon', 'В начале первого уровня нет подсказки про призыв');
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-1-summon.png` });
    await checkTouchSizes(page, 'бой с подсказкой');

    // Подсказка не мешает нажимать: два призыва — и она больше не нужна.
    await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
    await page.waitForTimeout(PRESS_SETTLE_MS);
    await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.cats === 2 && s.tutorial !== 'summon',
      (s) => `После двух призывов подсказка про призыв осталась: котов ${s?.cats}, подсказка «${s?.tutorial}»`,
    );
    checkConsole('обучение: призыв');
  });

  await test.step('уровень 1: слияние', async () => {
    // Два одинаковых кота в соседних клетках: какие стихии выпали при призыве, заранее не известно.
    await page.evaluate(() => {
      for (let slot = 0; slot < 12; slot++) window.__smoke?.placeCat(slot, slot < 2 ? 'fire' : 'water', slot < 2 ? 1 : slot);
    });
    await expectHint('merge', 'Нет подсказки про слияние, хотя на поле два одинаковых кота');
    await page.waitForTimeout(WAVE_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-2-merge.png` });

    // Перетаскивание сквозь подсказку работает: коты сливаются, подсказка уходит.
    const centers = (await page.evaluate(() => window.__smoke?.slotCenters())) ?? [];
    await drag(page, centers[0], centers[1]);
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.cats === 11 && s.tutorial === null,
      (s) => `Коты не слились сквозь подсказку: котов ${s?.cats}, подсказка «${s?.tutorial}»`,
    );
    checkConsole('обучение: слияние');
  });

  await test.step('уровень 1: лимит призывов', async () => {
    await startLevel(ids[0]);
    // С началом волны лимит обновляется: тратим его целиком уже в первой волне, чтобы он не сбросился посреди проверки.
    await waitFor(
      page,
      WAVE_TIMEOUT,
      (s) => s.hud?.wave === 1,
      (s) => `Первая волна не началась (волна ${s?.hud?.wave ?? '?'})`,
    );
    await page.evaluate(() => window.__smoke?.addGold(100));
    const limit = (await state(page))?.hud?.summonLimit ?? 0;
    for (let n = 0; n < limit; n++) {
      await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
      await page.waitForTimeout(PRESS_SETTLE_MS);
    }
    // Котам ставим разные уровни: подсказка про слияние не должна заслонить подсказку про лимит.
    await page.evaluate(() => {
      (window.__smoke?.catSlots() ?? []).forEach((slot, index) => window.__smoke?.placeCat(slot, 'water', index + 2));
    });
    await expectHint('limit', 'Призывы волны кончились, а подсказки про лимит нет');
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-3-limit.png` });
    await checkTexts(page, 'подсказка про лимит');

    // Призыв со штрафом — игрок понял: подсказка уходит и больше не возвращается.
    await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
    await page.evaluate(() => {
      (window.__smoke?.catSlots() ?? []).forEach((slot, index) => window.__smoke?.placeCat(slot, 'water', index + 2));
    });
    await page.waitForTimeout(TUTORIAL_GONE_MS);
    const after = await state(page);
    if (after?.tutorial === 'limit' && (after.hud?.overLimitMult ?? 1) <= 2) {
      throw new Error('Подсказка про лимит осталась после призыва со штрафом');
    }
    checkConsole('обучение: лимит');
  });

  await test.step('уровень 2: продажа', async () => {
    await startLevel(ids[1]);
    // Поле занято котами одной стихии и разных уровней: слить некого, гибрида не сделать.
    await page.evaluate(() => {
      for (let slot = 0; slot < 12; slot++) window.__smoke?.placeCat(slot, 'water', slot + 1);
    });
    await expectHint('sell', 'Поле занято, пары ни у кого нет, а подсказки про продажу нет');
    await page.waitForTimeout(WAVE_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-4-sell.png` });
    await checkTexts(page, 'подсказка про продажу');

    const centers = (await page.evaluate(() => window.__smoke?.slotCenters())) ?? [];
    await drag(page, centers[0], SELL_POINT);
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.cats === 11 && s.tutorial === null,
      (s) => `Кот не продан сквозь подсказку или она осталась: котов ${s?.cats}, подсказка «${s?.tutorial}»`,
    );
    checkConsole('обучение: продажа');
  });

  await test.step('уровень 2: гибрид', async () => {
    await startLevel(ids[1]);
    await page.evaluate(() => {
      window.__smoke?.placeCat(4, 'fire', 1);
      window.__smoke?.placeCat(7, 'water', 1);
    });
    await expectHint('hybrid', 'Нет подсказки про гибрида, хотя есть коты разных стихий и кристалл');
    await page.waitForTimeout(WAVE_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-5-hybrid.png` });
    checkConsole('обучение: гибрид');
  });

  await test.step('уровень 3: метеор', async () => {
    await startLevel(ids[2]);
    await expectHint('meteor', 'Мыши вышли, метеор готов, а подсказки про него нет');
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-6-meteor.png` });

    await tap(page, METEOR_X, CONTROLS_CENTER_Y);
    await expectHint('meteorAim', 'После нажатия «Метеор» нет подсказки, куда бить');
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-7-meteor-aim.png` });

    // Удар по дороге у входа: подсказка про метеор больше не появляется.
    await tap(page, 30, 200);
    await expectHint(null, 'После удара метеором подсказка осталась');
    checkConsole('обучение: метеор');
  });

  await test.step('уровень 4: стройка', async () => {
    await startLevel(ids[3]);
    await page.evaluate(() => window.__smoke?.addGold(100));
    await expectHint('build', 'Строить можно, монеты есть, а подсказки про стройку нет');
    await page.waitForTimeout(SPAWN_SETTLE_MS);
    await page.screenshot({ path: `${SHOTS}/tutorial-8-build.png` });
    await checkTexts(page, 'подсказка про стройку');

    // Окно открыто — звать к нему незачем; строение поставлено — подсказка не возвращается.
    await tap(page, BUILD_X, CONTROLS_CENTER_Y);
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.buildRows === BUILD_KINDS && s.tutorial === null,
      (s) => `Окно стройки открыто (строк ${s?.buildRows ?? 0}), а подсказка «${s?.tutorial ?? 'нет'}»`,
    );
    await tap(page, ...buildRowCenter(0, BUILD_KINDS));
    await waitFor(
      page,
      SUMMON_TIMEOUT,
      (s) => s.buildings === 1 && s.buildRows === 0,
      (s) => `Лавка не построена (строений ${s?.buildings ?? 0})`,
    );
    await page.waitForTimeout(TUTORIAL_GONE_MS);
    if ((await state(page))?.tutorial !== null) throw new Error('После постройки подсказка про стройку вернулась');
    checkConsole('обучение: стройка');
  });

  await test.step('пройденный уровень — без подсказок', async () => {
    await startLevel(ids[0]);
    await page.evaluate(() => window.__smoke?.win());
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.result === 'win',
      () => 'Не появился экран победы',
    );
    await startLevel(ids[0]);
    // Дольше задержки подсказки: если бы она была положена, уже появилась бы.
    await page.waitForTimeout(2500);
    const hint = (await state(page))?.tutorial ?? null;
    if (hint !== null) throw new Error(`На пройденном уровне появилась подсказка «${hint}»`);
    checkConsole('обучение: пройденный уровень');
  });
});

/** Как часто нетерпеливый игрок повторяет касание, мс. */
const HURRY_TAP_MS = 120;

/**
 * Нетерпеливый игрок: жмёт в точку, не дожидаясь, пока экран проявится, и повторяет, пока экран `from` не сменится.
 * Падает, если экран так и не сменился.
 */
async function hurry(page: Page, from: string, x: number, y: number, step: string): Promise<void> {
  const deadline = Date.now() + SCREEN_TIMEOUT;
  let last: SmokeState | null = null;
  while (Date.now() < deadline) {
    last = await state(page);
    if (last && !last.scenes.includes(from)) return;
    if (errors.length > 0) break;
    await tap(page, x, y);
    await page.waitForTimeout(HURRY_TAP_MS);
  }
  checkConsole(step);
  throw new Error(`${step}: экран не сменился, ${scenesText(last)}`);
}

/** Бой на уровне `id` идёт и слушается: экран проявился, итога нет, кот призывается. */
async function expectBattle(page: Page, id: string, step: string): Promise<void> {
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.scenes.includes(SceneKey.Game) && s.scenes.includes(SceneKey.UI) && s.level === id && s.result === null,
    (s) => `${step}: бой на уровне ${id} не начался, ${scenesText(s)}, уровень ${s?.level ?? 'нет'}`,
  );
  const before = (await state(page))?.cats ?? 0;
  await tap(page, SUMMON_X, CONTROLS_CENTER_Y);
  await waitFor(
    page,
    SUMMON_TIMEOUT,
    (s) => s.cats > before,
    () => `${step}: бой на уровне ${id} не слушается касаний — кот не призван`,
  );
  checkConsole(step);
}

/** Побеждает в идущем бою и ждёт экран победы с кнопками. */
async function winBattle(page: Page, step: string): Promise<void> {
  await page.evaluate(() => window.__smoke?.win());
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.result === 'win',
    () => `${step}: не появился экран победы`,
  );
}

/** С экрана снаряжения — в бой; сценку, если она есть, пропускает. Всё — не дожидаясь проявления экранов. */
async function hurryIntoBattle(page: Page, step: string): Promise<void> {
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.scenes.includes(SceneKey.Gear),
    (s) => `${step}: не открылось снаряжение, ${scenesText(s)}`,
    true,
  );
  await hurry(page, SceneKey.Gear, ...gearButtonCenter('start'), `${step}: «В бой»`);
  if ((await state(page))?.scenes.includes(SceneKey.Story)) {
    await hurry(page, SceneKey.Story, ...storySkipCenter(), `${step}: «Пропустить»`);
  }
}

test('уровень за уровнем: победа → следующий уровень пять раз подряд, затем победа → меню → уровень', async ({ page }) => {
  await page.goto('/?smoke');
  await waitFor(
    page,
    SCREEN_TIMEOUT,
    (s) => s.scenes.includes(SceneKey.Menu),
    (s) => `Игра не дошла до меню: ${scenesText(s)}`,
  );
  const ids = (await page.evaluate(() => window.__smoke?.levelIds())) ?? [];
  const REPEATS = 5;

  await page.evaluate((levelId) => window.__smoke?.startLevel(levelId), ids[0]);
  await expectBattle(page, ids[0], 'первый уровень');

  for (let n = 1; n <= REPEATS; n++) {
    await test.step(`победа → следующий уровень, раз ${n}`, async () => {
      const step = `переход ${n}: ${ids[n - 1]} → ${ids[n]}`;
      await winBattle(page, step);
      // Кнопка итога нажимается сразу, как появилась, и ещё раз следом: второй переход начаться не должен.
      await tap(page, ...resultButtonCenter('right'));
      await tap(page, ...resultButtonCenter('right'));
      await hurryIntoBattle(page, step);
      await expectBattle(page, ids[n], step);
    });
  }

  await test.step('победа → в меню → уровень', async () => {
    const step = 'победа → меню → уровень';
    await winBattle(page, step);
    await tap(page, ...resultButtonCenter('left'));
    await waitFor(
      page,
      SCREEN_TIMEOUT,
      (s) => s.scenes.includes(SceneKey.Menu),
      (s) => `${step}: игра не вернулась в меню, ${scenesText(s)}`,
      true,
    );
    // Только что открытый уровень — следующий за пройденным.
    await hurry(page, SceneKey.Menu, ...menuCardCenter(REPEATS + 1), `${step}: карточка уровня`);
    await hurryIntoBattle(page, step);
    await expectBattle(page, ids[REPEATS + 1], step);
  });
});
