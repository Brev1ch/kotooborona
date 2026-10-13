import Phaser from 'phaser';
import { TRANSITION_FEEL } from '../feel';
import { COLORS } from '../layout';

const { r: red, g: green, b: blue } = Phaser.Display.Color.IntegerToRGB(COLORS.bg);

/** Экран проявляется из цвета фона. Вызывается в начале `create` каждой сцены. */
export function fadeIn(scene: Phaser.Scene): void {
  scene.input.enabled = true;
  scene.cameras.main.fadeIn(TRANSITION_FEEL.inMs, red, green, blue);
}

/**
 * Экран гаснет, затем выполняется `go` — переход на другую сцену.
 * Пока экран гаснет, нажатия не принимаются: второй переход не начнётся.
 */
export function fadeOut(scene: Phaser.Scene, go: () => void): void {
  const camera = scene.cameras.main;
  if (camera.fadeEffect.isRunning) return;
  scene.input.enabled = false;
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  camera.fadeOut(TRANSITION_FEEL.outMs, red, green, blue);
}
