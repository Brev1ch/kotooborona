import { test, type Page } from '@playwright/test';
import { SceneKey } from '../src/scenes/keys';

// Замер худшего случая: всё поле занято гибридами 5–6 уровня, на дороге всё время до 40 врагов (стресс из src/debug.ts).
// Печатает время кадра без замедления и с процессором, замедленным вчетверо — грубая замена слабому телефону.

const SCREEN_TIMEOUT = 10_000;
/** Столько длится замер; стресс всё это время держит на дороге до 40 врагов. */
const MEASURE_MS = 30_000;
const THROTTLE_RATES = [1, 4];

interface FrameStats {
  frames: number;
  fps: number;
  median: number;
  p95: number;
  p99: number;
  worst: number;
  /** Кадры дольше 33 мс: заметные рывки. */
  slow: number;
}

/** Пустое поле до стресса: потолок самого headless-браузера с программной отрисовкой. */
const IDLE_MS = 5_000;

async function measure(page: Page, duration: number): Promise<FrameStats> {
  return page.evaluate(
    (duration) =>
      new Promise<FrameStats>((resolve) => {
        const deltas: number[] = [];
        const start = performance.now();
        let last = start;
        const tick = (now: number): void => {
          deltas.push(now - last);
          last = now;
          if (now - start < duration) {
            requestAnimationFrame(tick);
            return;
          }
          const sorted = [...deltas].sort((a, b) => a - b);
          const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
          resolve({
            frames: deltas.length,
            fps: (deltas.length * 1000) / (now - start),
            median: at(0.5),
            p95: at(0.95),
            p99: at(0.99),
            worst: sorted[sorted.length - 1],
            slow: deltas.filter((delta) => delta > 33).length,
          });
        };
        requestAnimationFrame(tick);
      }),
    duration,
  );
}

for (const rate of THROTTLE_RATES) {
  test(`стресс: процессор ×${rate}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?smoke');
    await page.waitForFunction((menu) => window.__smoke?.state().scenes.includes(menu), SceneKey.Menu, {
      timeout: SCREEN_TIMEOUT,
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });

    await page.evaluate(() => window.__smoke?.startLevel());
    await page.waitForFunction((ui) => window.__smoke?.state().scenes.includes(ui), SceneKey.UI, {
      timeout: SCREEN_TIMEOUT,
    });
    const idle = await measure(page, IDLE_MS);
    await page.evaluate(() => {
      window.__smoke?.stress();
      window.__smoke?.startProfile();
    });

    const stats = await measure(page, MEASURE_MS);
    const cpu = await page.evaluate(() => window.__smoke?.stopProfile());
    const state = await page.evaluate(() => window.__smoke?.state());
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'нет WebGL';
    });
    await page.screenshot({ path: `screenshots/perf-x${rate}.png` });

    const ms = (value: number): string => value.toFixed(1);
    console.log(
      `\n[perf ×${rate}] ${ms(stats.fps)} fps · кадр: медиана ${ms(stats.median)} мс, p95 ${ms(stats.p95)}, p99 ${ms(stats.p99)}, ` +
        `худший ${ms(stats.worst)} · кадров дольше 33 мс: ${stats.slow} из ${stats.frames}` +
        `\n[perf ×${rate}] пустое поле до стресса: ${ms(idle.fps)} fps, медиана ${ms(idle.median)} мс` +
        `\n[perf ×${rate}] работа игры за кадр (обновление + отправка отрисовки): медиана ${ms(cpu?.median ?? 0)} мс, ` +
        `p95 ${ms(cpu?.p95 ?? 0)}, худший ${ms(cpu?.worst ?? 0)}` +
        `\n[perf ×${rate}] котов ${state?.cats}, врагов разом до ${cpu?.enemiesPeak}, объектов на поле до ${cpu?.objectsPeak}, отрисовка: ${renderer}`,
    );
    if (errors.length > 0) throw new Error(`Ошибки страницы:\n${errors.join('\n')}`);
  });
}
