import { describe, expect, it } from 'vitest';
import { Onboarding, type OnboardingWorld } from './Onboarding';

const calm: OnboardingWorld = { hybridPair: null, mergePair: null, meteorReady: false, aiming: false };

/** Обучение после первых трёх шагов: два одинаковых кота призваны и слиты. */
function afterBasics(): Onboarding {
  const onboarding = new Onboarding();
  onboarding.update(calm);
  onboarding.onSummon('fire');
  onboarding.update(calm);
  onboarding.onSummon('fire');
  onboarding.update({ ...calm, mergePair: [0, 1] });
  onboarding.onMerge(false);
  onboarding.update(calm);
  return onboarding;
}

describe('Onboarding: первые три шага', () => {
  it('сначала — призвать кота: открыта только кнопка призыва, первая волна ждёт', () => {
    const onboarding = new Onboarding();
    onboarding.update(calm);

    expect(onboarding.focus).toEqual({ step: 'summon', target: 'summonButton' });
    expect(onboarding.allows({ kind: 'summon' })).toBe(true);
    expect(onboarding.allows({ kind: 'button' })).toBe(false);
    expect(onboarding.allows({ kind: 'meteor' })).toBe(false);
    expect(onboarding.allows({ kind: 'drag', from: 0, to: 1 })).toBe(false);
    expect(onboarding.holdsWaves).toBe(true);
  });

  it('второй призыв — того же кота: стихия первого задана заранее', () => {
    const onboarding = new Onboarding();
    onboarding.update(calm);
    expect(onboarding.forcedElement).toBeNull();
    onboarding.onSummon('water');
    onboarding.update(calm);

    expect(onboarding.focus?.step).toBe('summonSame');
    expect(onboarding.forcedElement).toBe('water');
  });

  it('потом — слить пару: тянуть можно только одного из пары на другого', () => {
    const onboarding = new Onboarding();
    onboarding.onSummon('fire');
    onboarding.onSummon('fire');
    onboarding.update({ ...calm, mergePair: [3, 7] });

    expect(onboarding.focus).toEqual({ step: 'merge', from: 3, to: 7 });
    expect(onboarding.allows({ kind: 'drag', from: 3, to: 7 })).toBe(true);
    expect(onboarding.allows({ kind: 'drag', from: 7, to: 3 })).toBe(true);
    expect(onboarding.allows({ kind: 'drag', from: 3, to: null })).toBe(true);
    expect(onboarding.allows({ kind: 'drag', from: 3, to: 5 })).toBe(false);
    expect(onboarding.allows({ kind: 'drag', from: 5, to: 7 })).toBe(false);
    expect(onboarding.allows({ kind: 'summon' })).toBe(false);
  });

  it('пары нет — снова призыв того же кота, пока она не появится', () => {
    const onboarding = new Onboarding();
    onboarding.onSummon('fire');
    onboarding.onSummon('air');
    onboarding.update(calm);

    expect(onboarding.focus?.step).toBe('summonSame');
    expect(onboarding.forcedElement).toBe('fire');
  });

  it('после слияния волны идут, а обучение ждёт событий: всё можно', () => {
    const onboarding = afterBasics();

    expect(onboarding.holdsWaves).toBe(false);
    expect(onboarding.basicsDone).toBe(true);
    expect(onboarding.focus).toBeNull();
    expect(onboarding.holdsBattle).toBe(false);
    expect(onboarding.allows({ kind: 'button' })).toBe(true);
    expect(onboarding.allows({ kind: 'summon' })).toBe(true);
    expect(onboarding.finished).toBe(false);
  });
});

describe('Onboarding: смешение и метеор по событию', () => {
  it('впервые есть пара разных стихий — шаг смешения держит бой, пока его не сделают', () => {
    const onboarding = afterBasics();
    onboarding.update({ ...calm, hybridPair: [2, 4] });

    expect(onboarding.focus).toEqual({ step: 'hybrid', from: 2, to: 4 });
    expect(onboarding.holdsBattle).toBe(true);
    expect(onboarding.allows({ kind: 'drag', from: 2, to: 4 })).toBe(true);
    expect(onboarding.allows({ kind: 'summon' })).toBe(false);

    // Пара держится, даже если на миг пропала из замера (кота взяли в руку).
    onboarding.update(calm);
    expect(onboarding.focus).toEqual({ step: 'hybrid', from: 2, to: 4 });

    onboarding.onMerge(true);
    onboarding.update(calm);
    expect(onboarding.focus).toBeNull();
    expect(onboarding.holdsBattle).toBe(false);
  });

  it('заряд метеора полон — кнопка, затем прицел; бой стоит до удара', () => {
    const onboarding = afterBasics();
    onboarding.update({ ...calm, meteorReady: true });
    expect(onboarding.focus).toEqual({ step: 'meteor', target: 'meteorButton' });
    expect(onboarding.allows({ kind: 'meteor' })).toBe(true);
    expect(onboarding.allows({ kind: 'aim' })).toBe(false);
    expect(onboarding.holdsBattle).toBe(true);

    onboarding.update({ ...calm, meteorReady: true, aiming: true });
    expect(onboarding.focus).toEqual({ step: 'meteorAim' });
    expect(onboarding.allows({ kind: 'aim' })).toBe(true);
    expect(onboarding.allows({ kind: 'summon' })).toBe(false);

    onboarding.onMeteor();
    onboarding.update(calm);
    expect(onboarding.focus).toBeNull();
  });

  it('начатый шаг метеора не прерывается появившейся парой для смешения', () => {
    const onboarding = afterBasics();
    onboarding.update({ ...calm, meteorReady: true });
    onboarding.update({ ...calm, meteorReady: true, aiming: true, hybridPair: [0, 1] });

    expect(onboarding.focus?.step).toBe('meteorAim');
  });

  it('смешение и метеор сделаны — обучение пройдено', () => {
    const onboarding = afterBasics();
    onboarding.update({ ...calm, hybridPair: [0, 1] });
    onboarding.onMerge(true);
    onboarding.update({ ...calm, meteorReady: true });
    onboarding.onMeteor();

    expect(onboarding.finished).toBe(true);
    expect(onboarding.focus).toBeNull();
  });
});

describe('Onboarding: пропуск', () => {
  it('«Пропустить» снимает всё: волны идут, все действия открыты', () => {
    const onboarding = new Onboarding();
    onboarding.update(calm);
    onboarding.skip();
    onboarding.update(calm);

    expect(onboarding.finished).toBe(true);
    expect(onboarding.basicsDone).toBe(true);
    expect(onboarding.holdsWaves).toBe(false);
    expect(onboarding.focus).toBeNull();
    expect(onboarding.allows({ kind: 'button' })).toBe(true);
  });
});
