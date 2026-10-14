import Phaser from 'phaser';
import { MOTION_FEEL } from '../feel';
import { addBakedShape } from '../scenes/textures';

// Заготовки движения персонажей на твинах сцены: замирают на паузе и ускоряются вместе с боем (`timeScale` твинов).
// Каждая заготовка трогает свои свойства своего контейнера, поэтому они не спорят друг с другом:
// дыхание — масштаб позы, кивок — её сдвиг, походка — наклон и подскок, попадание — сдвиг и масштаб слоя реакции.
// Бесконечные движения (дыхание, походка, полёт) — счётчики без цели: владелец останавливает их сам (`stop()`),
// а разовые твины на своих объектах — `stopAll`, когда удаляет персонажа.

type Target = Phaser.GameObjects.Container | Phaser.GameObjects.Image;

/** Доля периода, с которой начинается следующее дыхание или шаг: золотое сечение раскидывает фазы равномерно. */
let lastPhase = 0;
function nextPhase(): number {
  lastPhase = (lastPhase + 0.618034) % 1;
  return lastPhase;
}

/**
 * Бесконечное движение: счётчик по кругу за `periodMs`, каждый кадр `apply` получает волну от −1 до 1 со своей фазой —
 * соседние персонажи не дышат и не шагают в такт. Цели у счётчика нет: останавливает его владелец (`stop()`).
 */
function looped(scene: Phaser.Scene, periodMs: number, apply: (wave: number, turn: number) => void): Phaser.Tweens.Tween {
  const phase = nextPhase();
  const at = (value: number): void => {
    const turn = (value + phase) % 1;
    apply(Math.sin(turn * Math.PI * 2), turn);
  };
  at(0);
  return scene.tweens.addCounter({ from: 0, to: 1, duration: periodMs, repeat: -1, onUpdate: (tween) => at(tween.getValue() ?? 0) });
}

/** Дыхание: лёгкое сжатие и растяжение по вертикали. Цель стоит в точке ног, чтобы ноги не отрывались от земли. */
export function breathe(scene: Phaser.Scene, target: Target): Phaser.Tweens.Tween {
  const { periodMs, stretch } = MOTION_FEEL.breathe;
  return looped(scene, periodMs, (wave) => {
    const inhale = (wave + 1) / 2;
    target.setScale(1 - (stretch / 2) * inhale, 1 + stretch * inhale);
  });
}

/**
 * Вперевалку: наклон из стороны в сторону и подскок на каждом шаге. `speed` — точек пути в секунду: чем быстрее враг,
 * тем чаще шаги. Замедленному врагу владелец сбавляет `timeScale` твина.
 */
export function waddle(scene: Phaser.Scene, target: Target, speed: number): Phaser.Tweens.Tween {
  const { angle, hop, stepPx, minStepMs, maxStepMs } = MOTION_FEEL.waddle;
  const stepMs = Phaser.Math.Clamp((stepPx / Math.max(speed, 1)) * 1000, minStepMs, maxStepMs);
  // Наклон туда и обратно — два шага; подскок — на каждом шаге, выше всего посередине переката. Подскок — от того места,
  // где цель стоит (у картинки анфас — точка лап).
  const baseY = target.y;
  return looped(scene, stepMs * 2, (wave, turn) => {
    target.setRotation(angle * wave);
    target.setY(baseY - hop * Math.abs(Math.cos(turn * Math.PI * 2)));
  });
}

/** Полёт: плавное качание вверх-вниз без наклона. */
export function hover(scene: Phaser.Scene, target: Target): Phaser.Tweens.Tween {
  const { periodMs, amp } = MOTION_FEEL.hover;
  const baseY = target.y;
  return looped(scene, periodMs, (wave) => void target.setY(baseY + amp * wave));
}

/** Подкоп: `body` уходит в землю (`down`) или выходит из неё, холмик `mound` и тень `shadow` — наоборот. */
export function burrow(scene: Phaser.Scene, body: Target, mound: Target | null, shadow: Target | null, down: boolean): void {
  const { ms, sink, ease } = MOTION_FEEL.burrow;
  scene.tweens.killTweensOf([body, ...(mound ? [mound] : [])]);
  const above = down ? body : mound;
  const below = down ? mound : body;
  shadow?.setVisible(!down);
  if (above) {
    scene.tweens.add({
      targets: above,
      scale: down ? sink : 0,
      alpha: 0,
      duration: ms,
      ease,
      onComplete: () => void above.setVisible(false),
    });
  }
  if (below) {
    below.setVisible(true).setScale(down ? 0 : sink).setAlpha(0);
    scene.tweens.add({ targets: below, scale: 1, alpha: 1, duration: ms, ease: 'Quad.easeOut' });
  }
}

/**
 * Выстрел: кивок `pose` к цели (направление `dx`, `dy`; без него — вверх) и отдача `figure`.
 * Прежний кивок и прежняя отдача обрываются, дыхание на том же контейнере — нет.
 */
export function attack(
  scene: Phaser.Scene,
  pose: Target,
  home: [number, number],
  figure: Target,
  figureScale: number,
  previous: Phaser.Tweens.Tween[],
  dx = 0,
  dy = -1,
): Phaser.Tweens.Tween[] {
  const { nodPx, nodMs, recoilScale, recoilMs } = MOTION_FEEL.attack;
  for (const tween of previous) tween.stop();
  const length = Math.hypot(dx, dy) || 1;
  pose.setPosition(...home);
  figure.setScale(figureScale * recoilScale);
  return [
    scene.tweens.add({ targets: pose, x: home[0] + (dx / length) * nodPx, y: home[1] + (dy / length) * nodPx, duration: nodMs, yoyo: true, ease: 'Quad.easeOut' }),
    scene.tweens.add({ targets: figure, scale: figureScale, duration: recoilMs }),
  ];
}

/** Попадание: белая вспышка `flash`, сжатие и отскок `react` назад — против направления движения `heading` (радианы). */
export function hit(scene: Phaser.Scene, react: Target, flash: Target, heading: number): void {
  const { flashAlpha, flashMs, squash, squashMs, knockPx, knockMs } = MOTION_FEEL.hit;
  scene.tweens.killTweensOf([react, flash]);
  react.setPosition(0, 0).setScale(squash);
  flash.setAlpha(flashAlpha);
  scene.tweens.add({ targets: flash, alpha: 0, duration: flashMs });
  scene.tweens.add({ targets: react, scale: 1, duration: squashMs });
  scene.tweens.add({
    targets: react,
    x: -Math.cos(heading) * knockPx,
    y: -Math.sin(heading) * knockPx,
    duration: knockMs / 2,
    yoyo: true,
    ease: 'Quad.easeOut',
  });
}

/** Гибель: `react` сплющивается, `whole` гаснет; по окончании — `done`. Облачко частиц пускает сцена из общего пула. */
export function death(scene: Phaser.Scene, react: Target, whole: Target, done: () => void): void {
  const { ms, squashX, squashY, ease } = MOTION_FEEL.death;
  scene.tweens.killTweensOf(react);
  scene.tweens.add({ targets: react, scaleX: squashX, scaleY: squashY, duration: ms, ease });
  scene.tweens.add({ targets: whole, alpha: 0, duration: ms, ease, onComplete: done });
}

/** Появление: из нуля с перелётом масштаба. */
export function spawn(scene: Phaser.Scene, target: Target, delay = 0): Phaser.Tweens.Tween {
  const { ms, ease } = MOTION_FEEL.spawn;
  target.setScale(0);
  return scene.tweens.add({ targets: target, scale: 1, delay, duration: ms, ease });
}

/** Тень: овал `width`×`height` с центром в точке ног; запекается одной текстурой на размер. */
export function addShadow(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Image {
  const { color, alpha } = MOTION_FEEL.shadow;
  const w = Math.round(width);
  const h = Math.round(height);
  return addBakedShape(scene, `shadow-${w}x${h}`, w, h, (g) => {
    g.fillStyle(color, alpha);
    g.fillEllipse(0, 0, w, h);
  }).setPosition(x, y);
}

/** Останавливает бесконечные твины персонажа: без этого они пережили бы его самого. */
export function stopAll(scene: Phaser.Scene | undefined, targets: Target[]): void {
  scene?.tweens.killTweensOf(targets);
}
