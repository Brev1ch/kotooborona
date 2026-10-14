import Phaser from 'phaser';
import { art } from '../art';
import { audio } from '../audio';
import { story, type StoryScene as StoryData, type StorySpeaker } from '../data';
import { addEnemyPortrait, drawEnemyBody } from '../entities/EnemyView';
import { HeroView } from '../entities/HeroView';
import { STORY_FEEL } from '../feel';
import { t, type StringKey } from '../i18n';
import { COLORS, FONTS, GAME_H, GAME_W, STORY, storySkipCenter, TEXT_COLORS } from '../layout';
import { artId } from '../systems/Art';
import { storyBefore } from '../systems/Story';
import { SceneKey, type LevelSceneData, type StorySceneData } from './keys';
import { fadeIn, fadeOut } from './transitions';
import { addButton } from './widgets';

/** Сценка перед уровнем или null: идёт при каждом входе в уровень, в том числе при повторном прохождении. */
export function storyForLevel(levelId: string): StoryData | null {
  return storyBefore(story, levelId);
}

const SPEAKER_COLOR: Record<StorySpeaker, string> = {
  archmage: TEXT_COLORS.brass,
  king: TEXT_COLORS.danger,
  mouse: TEXT_COLORS.muted,
};

/**
 * Сценка перед уровнем или после победы: портрет говорящего и реплика; касание листает, «Пропустить» сразу закрывает.
 * Сценка перед уровнем ведёт в бой (через карточку нового врага), после победы — туда, куда игрок нажал (`then`).
 */
export class StoryScene extends Phaser.Scene {
  private levelId!: string;
  private then: StorySceneData['then'] = undefined;
  private scenario: StoryData | null = null;
  private line = 0;
  private portrait: Phaser.GameObjects.GameObject | null = null;
  private nameText!: Phaser.GameObjects.Text;
  private lineText!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super(SceneKey.Story);
  }

  init(data: StorySceneData): void {
    this.levelId = data.levelId;
    this.then = data.then;
    this.scenario = data.storyId
      ? (story.scenes.find((scene) => scene.id === data.storyId) ?? null)
      : storyForLevel(data.levelId);
  }

  create(): void {
    this.leaving = false;
    this.line = 0;
    this.portrait = null;
    if (!this.scenario) {
      this.startBattle();
      return;
    }
    fadeIn(this);

    const { panelY, panelW, panelH, nameY, hintY, textPad } = STORY;
    this.add.rectangle(GAME_W / 2, panelY, panelW, panelH, COLORS.panel).setStrokeStyle(1, COLORS.line);
    this.nameText = this.add
      .text(GAME_W / 2, nameY, '', { fontFamily: FONTS.display, fontSize: '20px' })
      .setOrigin(0.5);
    this.lineText = this.add
      .text(GAME_W / 2, panelY, '', {
        fontFamily: FONTS.body,
        fontSize: '16px',
        color: TEXT_COLORS.fg,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: panelW - textPad * 2 },
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(GAME_W / 2, hintY, t('story.next'), { fontFamily: FONTS.body, fontSize: '13px', color: TEXT_COLORS.muted })
      .setOrigin(0.5);
    this.tweens.add({
      targets: hint,
      alpha: STORY_FEEL.hintAlpha,
      duration: STORY_FEEL.hintPulseMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Листает касание в любом месте экрана; кнопка «Пропустить» лежит поверх и забирает своё нажатие.
    this.add
      .zone(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H)
      .setName('story')
      .setInteractive()
      .on('pointerup', () => this.next());
    addButton(this, ...storySkipCenter(), STORY.skipW, STORY.skipH, t('story.skip'), false, () => this.startBattle());

    this.showLine();
  }

  /** Номер реплики на экране и сколько их всего; читает смоук-проверка (src/smoke.ts). */
  progressState(): { line: number; total: number } | null {
    return this.scenario ? { line: this.line + 1, total: this.scenario.lines.length } : null;
  }

  private next(): void {
    if (!this.scenario || this.leaving) return;
    audio.play('click');
    if (this.line >= this.scenario.lines.length - 1) {
      this.startBattle();
      return;
    }
    this.line++;
    this.showLine();
  }

  private showLine(): void {
    if (!this.scenario) return;
    const { speaker, text } = this.scenario.lines[this.line];
    this.portrait?.destroy();
    const portrait = this.addPortrait(speaker);
    this.portrait = portrait;
    this.nameText.setText(t(`story.speaker.${speaker}`)).setColor(SPEAKER_COLOR[speaker]);
    this.lineText.setText(t(text as StringKey));

    const { lineMs, popFrom, popEase } = STORY_FEEL;
    this.tweens.killTweensOf([this.nameText, this.lineText]);
    this.tweens.add({ targets: [this.nameText, this.lineText], alpha: { from: 0, to: 1 }, duration: lineMs });
    this.tweens.add({
      targets: portrait,
      scale: { from: portrait.scale * popFrom, to: portrait.scale },
      duration: lineMs,
      ease: popEase,
    });
  }

  /** Портрет говорящего: готовый арт, а пока его нет — та же фигура, что в бою, только крупно. */
  private addPortrait(speaker: StorySpeaker): Phaser.GameObjects.Container | Phaser.GameObjects.Graphics | Phaser.GameObjects.Image {
    const { portraitY } = STORY;
    const picture = art.add(this, artId.portrait(speaker));
    if (picture) return picture.setPosition(GAME_W / 2, portraitY);
    if (speaker === 'archmage') {
      const hero = new HeroView(this, GAME_W / 2, portraitY, COLORS.meteor).setScale(STORY_FEEL.heroScale);
      hero.setReady(true);
      return hero;
    }
    // Своего портрета нет — картинка врага с поля; а пока нет и её — мышь, нарисованная видом сверху, носом вправо.
    const type = speaker === 'king' ? 'king' : 'mouse';
    if (art.find(this, artId.enemy(type))) return addEnemyPortrait(this, type, GAME_W / 2, portraitY, STORY.enemyPortraitSize);
    const g = this.add.graphics({ x: GAME_W / 2, y: portraitY });
    drawEnemyBody(g, type);
    return g.setScale(speaker === 'king' ? STORY_FEEL.kingScale : STORY_FEEL.mouseScale);
  }

  private startBattle(): void {
    if (this.leaving) return;
    this.leaving = true;
    // Перед уровнем дальше — карточка нового врага; если показывать некого, она сама сразу начнёт бой.
    const data: LevelSceneData = { levelId: this.levelId };
    const go = (): void => {
      if (this.then) this.scene.start(this.then.scene, this.then.data);
      else this.scene.start(SceneKey.Intro, data);
    };
    if (!this.scenario) {
      go();
      return;
    }
    fadeOut(this, go);
  }
}
