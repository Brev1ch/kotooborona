import type Phaser from 'phaser';
import { HINT_BUBBLE_FEEL } from '../feel';
import { COLORS, FONTS, GAME_W, TEXT_COLORS } from '../layout';

/** Имя надписи пузыря: пузырь нарочно ложится поверх интерфейса, проверка наложений в смоуке его пропускает. */
export const HINT_BUBBLE_NAME = 'hint-bubble';

/**
 * Подсказка при первой встрече: пузырь с одной-двумя строками и хвостиком вверх, к цели над ним (`x`, `y` — кончик хвостика).
 * Касаний не перехватывает: уходит с первым касанием где угодно или сам через несколько секунд.
 */
export function showHintBubble(scene: Phaser.Scene, x: number, y: number, line: string): Phaser.GameObjects.Container {
  const { width, tail, showMs, hideMs, lifeMs, bobPx, bobMs } = HINT_BUBBLE_FEEL;
  const text = scene.add
    .text(0, 0, line, { fontFamily: FONTS.display, fontSize: '14px', color: TEXT_COLORS.fg, align: 'center', wordWrap: { width: width - 24 } })
    .setOrigin(0.5, 0)
    .setName(HINT_BUBBLE_NAME);
  const w = Math.min(width, text.width + 24);
  const h = text.height + 14;
  // Пузырь не выходит за край экрана, а хвостик остаётся над целью.
  const margin = 8;
  const left = Math.min(Math.max(x - w / 2, margin), GAME_W - margin - w) - x;
  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.bg, 0.95);
  bg.lineStyle(2, COLORS.brass);
  bg.fillRoundedRect(left, tail, w, h, 10);
  bg.strokeRoundedRect(left, tail, w, h, 10);
  bg.fillStyle(COLORS.brass);
  bg.fillTriangle(-tail, tail + 1, tail, tail + 1, 0, 0);
  text.setPosition(left + w / 2, tail + 7);
  const bubble = scene.add.container(x, y, [bg, text]).setAlpha(0);
  // Экран мог дорисоваться после пузыря (карточки уровней под сундуком): пузырь поднимается наверх.
  scene.time.delayedCall(0, () => {
    if (bubble.active) scene.children.bringToTop(bubble);
  });
  scene.tweens.add({ targets: bubble, alpha: 1, duration: showMs });
  scene.tweens.add({ targets: bubble, y: y + bobPx, duration: bobMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });

  let gone = false;
  const hide = (): void => {
    if (gone) return;
    gone = true;
    scene.tweens.killTweensOf(bubble);
    scene.tweens.add({ targets: bubble, alpha: 0, duration: hideMs, onComplete: () => bubble.destroy() });
  };
  scene.input.once('pointerdown', hide);
  scene.time.delayedCall(lifeMs, hide);
  return bubble;
}
