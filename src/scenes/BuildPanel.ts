import Phaser from 'phaser';
import { audio } from '../audio';
import type { BuildingLevel } from '../data';
import { addBuildingIcon } from '../entities/BuildingView';
import { t } from '../i18n';
import { BUILD_PANEL, buildRowCenter, COLORS, CONTROLS_Y, FONTS, GAME_H, GAME_W, TEXT_COLORS } from '../layout';
import type { GameScene } from './GameScene';
import type { BuildOffer, UpgradeOffer } from './keys';
import { addCoinIcon, addPressFeel } from './widgets';

const COIN_SIZE = 12;
const TITLE_Y = -9;
const DETAIL_Y = 11;

/** Одна строка окна: что нарисовать и что сделать по нажатию. */
interface Row {
  kind: BuildOffer['kind'];
  level: number;
  title: string;
  detail: string;
  /** Строка выключена: нажать нельзя, подпись объясняет почему. */
  disabled: boolean;
  /** Цена и хватает ли на неё монет; null — платить не за что. */
  price: { cost: number; affordable: boolean } | null;
  /** Мелкая подпись под ценой. */
  note: string;
  act: () => void;
}

/** Что даёт строение на уровне, одной строкой. */
export function buildingEffect(stats: BuildingLevel): string {
  if (stats.summonLimit) return t('build.summonLimit', { count: stats.summonLimit });
  if (stats.crystals) {
    const waves = stats.everyWaves ?? 1;
    return waves > 1 ? t('build.crystalsEvery', { crystals: stats.crystals, waves }) : t('build.crystals', { crystals: stats.crystals });
  }
  return t('build.gold', { gold: stats.gold ?? 0 });
}

/**
 * Окно над нижней полосой: список строений, которые можно поставить, или улучшение строения, на которое нажали.
 * Бой под окном идёт; нажатие мимо строк окно закрывает.
 */
export class BuildPanel {
  private container: Phaser.GameObjects.Container | null = null;
  /** Что открыто: список строений или улучшение строения в клетке. */
  private mode: { upgradeSlot: number | null } | null = null;
  /** Содержимое, уже показанное на экране: окно перерисовывается, только когда оно изменилось. */
  private shown = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: GameScene,
  ) {}

  get open(): boolean {
    return this.container !== null;
  }

  /** Сколько строк в открытом окне; 0 — окно закрыто. */
  get rows(): number {
    return this.mode ? this.buildRows().length : 0;
  }

  showBuild(): void {
    this.mode = { upgradeSlot: null };
    this.refresh();
  }

  showUpgrade(slot: number): void {
    this.mode = { upgradeSlot: slot };
    this.refresh();
  }

  close(): void {
    this.container?.destroy();
    this.container = null;
    this.mode = null;
    this.shown = '';
  }

  /** Вызывается при каждом изменении боя: цены и доступность в открытом окне остаются верными. */
  refresh(): void {
    if (!this.mode) return;
    const rows = this.buildRows();
    // Строение продали или бой кончился — показывать нечего.
    if (rows.length === 0) {
      this.close();
      return;
    }
    const title = this.mode.upgradeSlot === null ? t('build.title') : rows[0].title;
    const key = JSON.stringify([title, rows.map(({ act: _act, ...rest }) => rest)]);
    if (key === this.shown) return;
    this.shown = key;
    this.container?.destroy();
    this.container = this.draw(title, rows);
  }

  private buildRows(): Row[] {
    if (!this.mode) return [];
    if (this.mode.upgradeSlot === null) return this.game.buildOffers().map((offer) => this.buildRow(offer));
    const offer = this.game.upgradeOffer(this.mode.upgradeSlot);
    return offer ? [this.upgradeRow(offer)] : [];
  }

  private buildRow(offer: BuildOffer): Row {
    const blocked = offer.block === 'limit' ? t('build.limit') : offer.block === 'noRoom' ? t('build.noRoom') : null;
    return {
      kind: offer.kind,
      level: 1,
      title: t(`build.${offer.kind}`),
      detail: blocked ?? buildingEffect(offer.stats),
      disabled: offer.block !== null || !offer.affordable,
      price: { cost: offer.cost, affordable: offer.affordable },
      note: t('build.count', { count: offer.count, max: offer.max }),
      act: () => {
        if (this.game.build(offer.kind)) this.close();
      },
    };
  }

  private upgradeRow(offer: UpgradeOffer): Row {
    const name = t(`build.${offer.kind}`);
    const { next } = offer;
    return {
      kind: offer.kind,
      level: next ? offer.level + 1 : offer.level,
      title: t('build.upgradeTitle', { name, level: offer.level }),
      detail: next ? buildingEffect(next.stats) : t('build.maxLevel'),
      disabled: !next || !offer.affordable,
      price: next ? { cost: next.cost, affordable: offer.affordable } : null,
      note: next ? t('build.upgrade', { level: offer.level + 1 }) : buildingEffect(offer.stats),
      // Окно остаётся открытым: следующее улучшение можно купить сразу.
      act: () => void this.game.upgrade(offer.slot),
    };
  }

  private draw(title: string, rows: Row[]): Phaser.GameObjects.Container {
    const { w, pad, titleH, rowH, rowGap, bottomGap } = BUILD_PANEL;
    const height = pad * 2 + titleH + rows.length * rowH + (rows.length - 1) * rowGap;
    const top = CONTROLS_Y - bottomGap - height;

    // Невидимая плашка во весь экран: нажатие мимо окна его закрывает.
    const dim = this.scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.bg, 0).setInteractive();
    dim.on('pointerdown', () => this.close());
    const bg = this.scene.add
      .rectangle(GAME_W / 2, top + height / 2, w, height, COLORS.bg)
      .setStrokeStyle(1, COLORS.brass)
      .setInteractive();
    const heading = this.scene.add
      .text(GAME_W / 2, top + pad + titleH / 2, title, { fontFamily: FONTS.display, fontSize: '15px', color: TEXT_COLORS.fg })
      .setOrigin(0.5);

    const parts = rows.map((row, index) => this.drawRow(row, ...buildRowCenter(index, rows.length)));
    return this.scene.add.container(0, 0, [dim, bg, heading, ...parts]);
  }

  private drawRow(row: Row, x: number, y: number): Phaser.GameObjects.Container {
    const { w, pad, rowH, iconX, textX, iconScale } = BUILD_PANEL;
    const width = w - pad * 2;
    const left = -width / 2;
    const right = width / 2 - pad;
    const mainColor = row.disabled ? TEXT_COLORS.muted : TEXT_COLORS.fg;

    const bg = this.scene.add.rectangle(0, 0, width, rowH, COLORS.panel).setStrokeStyle(1, COLORS.line).setName(`build-${row.kind}`);
    const icon = addBuildingIcon(this.scene, row.kind, row.level).setPosition(left + iconX, 0);
    icon.setScale(icon.scale * iconScale).setAlpha(row.disabled ? 0.5 : 1);
    // В строке улучшения название уже стоит в заголовке окна: строка говорит, что именно купит нажатие.
    const upgrade = this.mode?.upgradeSlot !== null;
    const name = this.scene.add
      .text(left + textX, TITLE_Y, upgrade ? row.note : row.title, { fontFamily: FONTS.display, fontSize: '14px', color: mainColor })
      .setOrigin(0, 0.5);
    const detail = this.scene.add
      .text(left + textX, DETAIL_Y, row.detail, { fontFamily: FONTS.body, fontSize: '11px', color: TEXT_COLORS.muted })
      .setOrigin(0, 0.5);
    const parts: Phaser.GameObjects.GameObject[] = [bg, icon, name, detail];

    if (row.price) {
      const price = this.scene.add
        .text(right, TITLE_Y, String(row.price.cost), {
          fontFamily: FONTS.display,
          fontSize: '14px',
          color: row.price.affordable ? TEXT_COLORS.brass : TEXT_COLORS.danger,
        })
        .setOrigin(1, 0.5);
      parts.push(price, addCoinIcon(this.scene, right - price.width - COIN_SIZE / 2 - 4, TITLE_Y, COIN_SIZE));
    }
    if (!upgrade) {
      parts.push(
        this.scene.add
          .text(right, DETAIL_Y, row.note, { fontFamily: FONTS.body, fontSize: '11px', color: TEXT_COLORS.muted })
          .setOrigin(1, 0.5),
      );
    }

    const container = this.scene.add.container(x, y, parts);
    if (!row.disabled) {
      bg.setInteractive({ useHandCursor: true });
      addPressFeel(this.scene, bg, container);
      bg.on('pointerdown', () => audio.play('click'));
      bg.on('pointerup', row.act);
    }
    return container;
  }
}
