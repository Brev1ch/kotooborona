import Phaser from 'phaser';
import { art as manifest, type BackgroundId } from './data';
import { addBakedShape } from './scenes/textures';
import { ArtCatalog, readArtIndex, type ArtLoad, type ArtRef } from './systems/Art';

const INDEX_KEY = 'art-index';
const DIR = 'assets/art';

/**
 * Готовый арт поверх рисунков кодом: сцены спрашивают картинку по имени из манифеста (`systems/Art.ts` → `artId`),
 * а если её ещё нет или она не загрузилась — рисуют по-старому.
 */
class GameArt {
  private catalog = new ArtCatalog(manifest);

  /**
   * Ставит в очередь загрузки сцены список готового арта, а когда он придёт — атласы и фон первого уровня.
   * Фоны остальных уровней грузит `preloadBackground`.
   */
  preload(scene: Phaser.Scene, firstBackground: BackgroundId): void {
    scene.load.json(INDEX_KEY, `${DIR}/index.json`);
    scene.load.once(`filecomplete-json-${INDEX_KEY}`, () => {
      this.catalog = new ArtCatalog(manifest, readArtIndex(scene.cache.json.get(INDEX_KEY)));
      this.queue(scene, this.catalog.startupLoads(firstBackground));
    });
  }

  /** Вход в уровень: его фон встаёт в очередь загрузки сцены, остальные фоны освобождаются. */
  preloadBackground(scene: Phaser.Scene, background: BackgroundId): void {
    for (const key of this.catalog.otherBackgroundKeys(background)) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
    }
    this.queue(scene, this.catalog.backgroundLoads(background));
  }

  private queue(scene: Phaser.Scene, loads: ArtLoad[]): void {
    for (const { key, file, frames } of loads) {
      if (scene.textures.exists(key)) continue;
      if (frames) scene.load.atlas(key, `${DIR}/${file}`, { frames });
      else scene.load.image(key, `${DIR}/${file}`);
    }
  }

  /** Точка `name` на картинке `id` из манифеста (`anchors`), в долях её ширины и высоты; null — точка не задана. */
  anchor(id: string, name: string): [number, number] | null {
    return manifest.images.find((image) => image.id === id)?.anchors?.[name] ?? null;
  }

  /** Готовая и загруженная картинка; null — рисуем кодом. */
  find(scene: Phaser.Scene, id: string): ArtRef | null {
    const ref = this.catalog.find(id);
    if (!ref || !scene.textures.exists(ref.key)) return null;
    if (ref.frame !== undefined && !scene.textures.get(ref.key).has(ref.frame)) return null;
    return ref;
  }

  /** Картинка в своём размере на экране, с центром в начале координат; null — её нет. */
  add(scene: Phaser.Scene, id: string): Phaser.GameObjects.Image | null {
    const ref = this.find(scene, id);
    return ref ? scene.add.image(0, 0, ref.key, ref.frame).setDisplaySize(ref.width, ref.height) : null;
  }

  /** Картинка, вписанная в квадрат `size`. */
  addIcon(scene: Phaser.Scene, id: string, x: number, y: number, size: number): Phaser.GameObjects.Image | null {
    const ref = this.find(scene, id);
    if (!ref) return null;
    const fit = size / Math.max(ref.width, ref.height);
    return scene.add.image(x, y, ref.key, ref.frame).setDisplaySize(ref.width * fit, ref.height * fit);
  }


}

export const art = new GameArt();

/**
 * Картинка из арта, а пока её нет — рисунок кодом вокруг начала координат, запечённый в текстуру `key`
 * (см. `addBakedShape`). `width` и `height` — прямоугольник, в который рисунок помещается целиком.
 */
export function addArtOrShape(
  scene: Phaser.Scene,
  id: string,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): Phaser.GameObjects.Image {
  return art.add(scene, id) ?? addBakedShape(scene, key, width, height, draw);
}
