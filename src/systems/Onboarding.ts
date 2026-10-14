import type { ElementId } from '../data/types';

// Обучение на первом уровне: учит действием, а не текстом. На каждом шаге игроку открыто одно действие —
// остальное затемнено и не нажимается. Первые три шага идут сразу и держат первую волну; смешение и метеор
// включаются по событию (впервые есть пара разных стихий, заряд метеора впервые полон) и на это время держат бой.

/** Шаг обучения на экране. */
export type OnboardingStep = 'summon' | 'summonSame' | 'merge' | 'hybrid' | 'meteor' | 'meteorAim';

/** Действие игрока, о котором спрашивают «можно ли сейчас». */
export type OnboardingAction =
  | { kind: 'summon' }
  | { kind: 'drag'; from: number; to: number | null }
  | { kind: 'meteor' }
  | { kind: 'aim' }
  /** Любая другая кнопка: стройка, реклама, ускорение, пауза. */
  | { kind: 'button' };

/** Что сейчас на поле — по этому обучение решает, пора ли шагу «смешение» или «метеор». */
export interface OnboardingWorld {
  /** Пара клеток с котами разных базовых стихий одного уровня, если на смешение хватает кристаллов. */
  hybridPair: [number, number] | null;
  /** Пара клеток с одинаковыми котами. */
  mergePair: [number, number] | null;
  meteorReady: boolean;
  aiming: boolean;
}

/** Что рисовать: шаг и куда показывать. */
export type OnboardingFocus =
  | { step: 'summon' | 'summonSame'; target: 'summonButton' }
  | { step: 'merge' | 'hybrid'; from: number; to: number }
  | { step: 'meteor'; target: 'meteorButton' }
  | { step: 'meteorAim' };

export class Onboarding {
  private summons = 0;
  private merged = false;
  private hybridDone = false;
  private meteorDone = false;
  private skipped = false;
  /** Пара, которую сейчас показывают: держится, пока шаг не сделан. */
  private pair: [number, number] | null = null;
  private current: OnboardingFocus | null = null;
  /** Стихия первого призванного кота: второй призыв даёт такого же — первая пара для слияния гарантирована. */
  private firstElement: ElementId | null = null;

  /** Обучение пройдено или пропущено: больше ничего не держит и не запрещает. */
  get finished(): boolean {
    return this.skipped || (this.merged && this.hybridDone && this.meteorDone);
  }

  /** Первые три шага сделаны: игрок умеет призывать и сливать. Этого хватает, чтобы считать обучение пройденным. */
  get basicsDone(): boolean {
    return this.skipped || this.merged;
  }

  /** Шаг на экране; null — обучение ждёт события или кончилось. */
  get focus(): OnboardingFocus | null {
    return this.finished ? null : this.current;
  }

  /** Первая волна ждёт, пока игрок не призовёт двух котов и не сольёт их. */
  get holdsWaves(): boolean {
    return !this.basicsDone;
  }

  /** Бой стоит: идёт шаг смешения или метеора, враги ждут, пока игрок сделает показанное. */
  get holdsBattle(): boolean {
    const step = this.focus?.step;
    return step === 'hybrid' || step === 'meteor' || step === 'meteorAim';
  }

  /** Какую стихию дать при следующем призыве; null — как обычно, наугад. */
  get forcedElement(): ElementId | null {
    return this.focus?.step === 'summonSame' ? this.firstElement : null;
  }

  skip(): void {
    this.skipped = true;
    this.current = null;
  }

  /** Обновляет шаг по тому, что на поле. Вызывать каждый кадр боя. */
  update(world: OnboardingWorld): void {
    if (this.finished) {
      this.current = null;
      return;
    }
    if (this.summons === 0) {
      this.current = { step: 'summon', target: 'summonButton' };
      return;
    }
    if (this.summons === 1) {
      this.current = { step: 'summonSame', target: 'summonButton' };
      return;
    }
    if (!this.merged) {
      this.pair ??= world.mergePair;
      this.current = this.pair ? { step: 'merge', from: this.pair[0], to: this.pair[1] } : { step: 'summonSame', target: 'summonButton' };
      return;
    }
    // Начатый шаг метеора доводится до конца: прицел — сразу после кнопки.
    if (!this.meteorDone && (this.current?.step === 'meteor' || this.current?.step === 'meteorAim')) {
      this.current = world.aiming ? { step: 'meteorAim' } : { step: 'meteor', target: 'meteorButton' };
      return;
    }
    if (!this.hybridDone && (this.current?.step === 'hybrid' || world.hybridPair)) {
      this.pair = this.current?.step === 'hybrid' ? this.pair : world.hybridPair;
      if (this.pair) {
        this.current = { step: 'hybrid', from: this.pair[0], to: this.pair[1] };
        return;
      }
    }
    if (!this.meteorDone && world.meteorReady) {
      this.current = world.aiming ? { step: 'meteorAim' } : { step: 'meteor', target: 'meteorButton' };
      return;
    }
    this.current = null;
  }

  /** Можно ли сейчас это действие: на шаге открыто только показанное, без шага (ждём события) — всё. */
  allows(action: OnboardingAction): boolean {
    const focus = this.focus;
    if (!focus) return true;
    switch (focus.step) {
      case 'summon':
      case 'summonSame':
        return action.kind === 'summon';
      case 'merge':
      case 'hybrid':
        // Взять можно любого из пары, отпустить — только на второго из неё (или вернуть на место).
        if (action.kind !== 'drag') return false;
        if (action.from !== focus.from && action.from !== focus.to) return false;
        return action.to === null || action.to === (action.from === focus.from ? focus.to : focus.from);
      case 'meteor':
        return action.kind === 'meteor';
      case 'meteorAim':
        return action.kind === 'aim';
    }
  }

  /** Игрок призвал кота стихии `element`. */
  onSummon(element: ElementId): void {
    if (this.summons === 0) this.firstElement = element;
    this.summons++;
  }

  /** Игрок слил двух котов; `hybrid` — смешал разные стихии. */
  onMerge(hybrid: boolean): void {
    this.pair = null;
    if (hybrid) this.hybridDone = true;
    // Слияние до смешения: первая пара могла оказаться разными стихиями — это тоже засчитывается как слияние.
    this.merged = true;
  }

  /** Метеор упал. */
  onMeteor(): void {
    this.meteorDone = true;
    this.current = null;
  }
}
