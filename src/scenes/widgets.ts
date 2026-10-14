import type Phaser from 'phaser';
import { art } from '../art';
import { audio } from '../audio';
import { BUTTON_FEEL } from '../feel';
import { t } from '../i18n';
import { COLORS, FONTS, MIN_TOUCH, TEXT_COLORS } from '../layout';
import { artId, type IconArt } from '../systems/Art';
import { addPlate, PLATE_SHADOW } from './plate';
import { ensureTextures, Texture } from './textures';

/**
 * Отклик на нажатие: пока `hit` держат, `target` опущен на `BUTTON_FEEL.pressDrop` — кнопка садится на свою тень
 * (тень плашки при этом остаётся на месте); отпустили или увели палец — пружинит обратно.
 * `enabled` — можно ли сейчас нажимать: выключенная кнопка не откликается.
 */
export function addPressFeel(
  scene: Phaser.Scene,
  hit: Phaser.GameObjects.Rectangle,
  target: Phaser.GameObjects.Container,
  enabled: () => boolean = () => true,
): void {
  const { width, height } = hit;
  const drop = BUTTON_FEEL.pressDrop;
  // Опущенная кнопка не должна терять нажатие у верхнего края: область нажатия растёт вверх ровно на сдвиг.
  const setHitArea = (lift: number): void => {
    const area = hit.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    area?.setTo(0, -lift, width, height + lift);
  };
  const shadow = target.getByName(PLATE_SHADOW) as Phaser.GameObjects.Image | null;
  let pressed = false;
  let baseY = 0;
  let shadowY = 0;

  const move = (down: boolean, duration: number, ease: string, onComplete?: () => void): void => {
    scene.tweens.killTweensOf(target);
    if (shadow) scene.tweens.killTweensOf(shadow);
    scene.tweens.add({ targets: target, y: baseY + (down ? drop : 0), duration, ease, onComplete });
    if (shadow) scene.tweens.add({ targets: shadow, y: shadowY - (down ? drop : 0), duration, ease });
  };

  hit.on('pointerdown', () => {
    if (!enabled() || pressed) return;
    pressed = true;
    baseY = target.y;
    shadowY = shadow?.y ?? 0;
    setHitArea(drop);
    move(true, BUTTON_FEEL.pressMs, BUTTON_FEEL.pressEase);
  });

  const release = (): void => {
    if (!pressed) return;
    pressed = false;
    move(false, BUTTON_FEEL.releaseMs, BUTTON_FEEL.releaseEase, () => setHitArea(0));
  };
  hit.on('pointerup', release);
  hit.on('pointerout', release);
}

interface ButtonParts {
  button: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

/** Значок валюты в квадрате `size`: готовый арт, а пока его нет — текстура, нарисованная кодом. */
function addIcon(scene: Phaser.Scene, icon: IconArt, x: number, y: number, size: number): Phaser.GameObjects.Image {
  const picture = art.addIcon(scene, artId.icon(icon), x, y, size);
  if (picture) return picture;
  ensureTextures(scene);
  return scene.add.image(x, y, Texture[icon]).setDisplaySize(size, size);
}

/** Плашка с подписью: главная — латунная, второстепенная — тёмная. */
function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  primary: boolean,
): ButtonParts {
  const bg = scene.add.rectangle(0, 0, width, height, primary ? COLORS.brass : COLORS.panel).setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: FONTS.display,
      fontSize: '15px',
      color: primary ? TEXT_COLORS.dark : TEXT_COLORS.fg,
    })
    .setOrigin(0.5);
  const button = scene.add.container(x, y, [bg, text]);
  addPlate(scene, bg, { fill: primary ? COLORS.brass : COLORS.panel });
  return { button, bg, text };
}

/** Кнопка перехода между экранами. Срабатывает один раз, на отпускание. */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  primary: boolean,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const { button, bg } = makeButton(scene, x, y, width, height, label, primary);
  addPressFeel(scene, bg, button);
  bg.on('pointerdown', () => audio.play('click'));
  bg.once('pointerup', onClick);
  return button;
}

/** Что переключает кнопка: звуки или музыку. У каждого своя настройка в сохранении. */
export type SoundKind = 'sound' | 'music';

const isOn = (kind: SoundKind): boolean => (kind === 'sound' ? audio.on : audio.musicOn);
const toggle = (kind: SoundKind): boolean => (kind === 'sound' ? audio.toggle() : audio.toggleMusic());

/** Переключатель с подписью: «Звук: вкл» / «Звук: выкл» или «Музыка: вкл» / «Музыка: выкл». */
export function addSoundToggle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: SoundKind = 'sound',
): Phaser.GameObjects.Container {
  const label = (): string => t(`${kind}.${isOn(kind) ? 'on' : 'off'}`);
  const { button, bg, text } = makeButton(scene, x, y, width, height, label(), false);
  // По имени кнопку находит смоук-проверка.
  bg.setName(`toggle:${kind}`);
  addPressFeel(scene, bg, button);
  bg.on('pointerdown', () => {
    toggle(kind);
    text.setText(label());
    audio.play('click');
  });
  return button;
}

/**
 * Кнопка звука или музыки: динамик с волнами или нота, а когда выключено — серые и перечёркнутые.
 * Состояние каждой хранится в сохранении.
 */
export function addSoundButton(scene: Phaser.Scene, x: number, y: number, kind: SoundKind = 'sound'): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, MIN_TOUCH, MIN_TOUCH, COLORS.panel).setName(kind).setInteractive({ useHandCursor: true });
  const icon = scene.add.graphics();
  const button = scene.add.container(x, y, [bg, icon]);
  addPlate(scene, bg, { fill: COLORS.panel });

  const draw = (on: boolean): void => {
    const color = on ? COLORS.range : COLORS.line;
    icon.clear();
    icon.fillStyle(color);
    icon.lineStyle(2, color);
    if (kind === 'music') {
      // Нота: две головки, штили и перекладина.
      icon.fillEllipse(-7, 8, 8, 6);
      icon.fillEllipse(5, 5, 8, 6);
      icon.lineBetween(-4, 8, -4, -8);
      icon.lineBetween(8, 5, 8, -11);
      icon.fillPoints([{ x: -5, y: -9 }, { x: 9, y: -12 }, { x: 9, y: -8 }, { x: -5, y: -5 }], true);
      if (!on) icon.lineBetween(-11, -11, 12, 12);
      return;
    }
    icon.fillRect(-11, -4, 6, 8);
    icon.fillTriangle(-6, -4, 1, -10, 1, 10);
    icon.fillTriangle(-6, -4, 1, 10, -6, 4);
    icon.lineStyle(2, color);
    if (on) {
      for (const radius of [6, 11]) {
        icon.beginPath();
        icon.arc(1, 0, radius, -Math.PI / 4, Math.PI / 4);
        icon.strokePath();
      }
    } else {
      icon.lineBetween(5, -5, 12, 5);
      icon.lineBetween(12, -5, 5, 5);
    }
  };
  draw(isOn(kind));

  addPressFeel(scene, bg, button);
  bg.on('pointerdown', () => {
    draw(toggle(kind));
    // Слышно только при включении: так игрок сразу понимает, что звук вернулся.
    audio.play('click');
  });
  return button;
}

/** Размеры значка ролика на кнопке рекламы. */
const AD_ICON = { width: 20, height: 15, radius: 4, gap: 8 };

/**
 * Кнопка наградной рекламы: зелёная, со значком ролика — игрок видит, что за нажатием последует реклама.
 * В отличие от `addButton`, срабатывает на каждое нажатие: ролик могут закрыть раньше времени и попробовать снова.
 */
export function addAdButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, width, height, COLORS.reward).setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(0, 0, label, { fontFamily: FONTS.display, fontSize: '15px', color: TEXT_COLORS.fg })
    .setOrigin(0, 0.5);

  // Значок и подпись вместе стоят по центру кнопки.
  const left = -(AD_ICON.width + AD_ICON.gap + text.width) / 2;
  const icon = scene.add.graphics({ x: left + AD_ICON.width / 2 });
  icon.fillStyle(COLORS.range);
  icon.fillRoundedRect(-AD_ICON.width / 2, -AD_ICON.height / 2, AD_ICON.width, AD_ICON.height, AD_ICON.radius);
  icon.fillStyle(COLORS.reward);
  icon.fillTriangle(-3, -4, -3, 4, 5, 0);
  text.setX(left + AD_ICON.width + AD_ICON.gap);

  const button = scene.add.container(x, y, [bg, icon, text]);
  addPlate(scene, bg, { fill: COLORS.reward });
  addPressFeel(scene, bg, button);
  bg.on('pointerdown', () => audio.play('click'));
  bg.on('pointerup', onClick);
  return button;
}

/** Уменьшает шрифт однострочной надписи, если она шире `maxWidth`: длинное название остаётся в своей плашке. */
export function fitText(text: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
  if (text.width <= maxWidth) return text;
  const size = parseFloat(String(text.style.fontSize));
  return text.setFontSize(Math.floor((size * maxWidth) / text.width));
}

/** Рыбка шириной `size`. */
export function addFishIcon(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  return addIcon(scene, 'fish', x, y, size);
}

/** Замок: предмет или уровень ещё закрыт. */
export function addLockIcon(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y }).setScale(scale);
  g.lineStyle(2.5, COLORS.line);
  g.beginPath();
  g.arc(0, -3, 5, Math.PI, 0);
  g.strokePath();
  g.fillStyle(COLORS.line);
  g.fillRoundedRect(-8, -3, 16, 12, 3);
  return g;
}

export interface FishCounter {
  /** Показывает новое число; если оно изменилось, счётчик вздрагивает. */
  set(value: number): void;
}

const FISH_COUNTER = { icon: 20, gap: 6, pulseScale: 1.25, pulseMs: 120 };

/** Счётчик рыбок: значок и число, вместе по центру точки. */
export function addFishCounter(scene: Phaser.Scene, x: number, y: number, value: number): FishCounter {
  const icon = addFishIcon(scene, 0, 0, FISH_COUNTER.icon);
  const text = scene.add
    .text(0, 0, '', { fontFamily: FONTS.display, fontSize: '16px', color: TEXT_COLORS.fish })
    .setOrigin(0, 0.5);
  const box = scene.add.container(x, y, [icon, text]);
  let shown = -1;

  const set = (next: number): void => {
    if (next === shown) return;
    const first = shown === -1;
    shown = next;
    text.setText(String(next));
    const width = FISH_COUNTER.icon + FISH_COUNTER.gap + text.width;
    icon.setX(-width / 2 + FISH_COUNTER.icon / 2);
    text.setX(-width / 2 + FISH_COUNTER.icon + FISH_COUNTER.gap);
    if (first) return;
    scene.tweens.killTweensOf(box);
    box.setScale(1);
    scene.tweens.add({ targets: box, scale: FISH_COUNTER.pulseScale, duration: FISH_COUNTER.pulseMs, yoyo: true });
  };
  set(value);
  return { set };
}

/** Значок кристалла высотой `size`. Нарисован, а не взят из шрифта: на всех устройствах выглядит одинаково. */
export function addCrystalIcon(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  return addIcon(scene, 'crystal', x, y, size);
}

/** Монета диаметром `size`. */
export function addCoinIcon(scene: Phaser.Scene, x: number, y: number, size: number): Phaser.GameObjects.Image {
  return addIcon(scene, 'coin', x, y, size);
}
