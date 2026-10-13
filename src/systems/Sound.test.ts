import { describe, expect, it } from 'vitest';
import { SoundGate } from './Sound';

const rules = { shot: { minIntervalMs: 100 }, win: { minIntervalMs: 0 } };

describe('SoundGate: ограничение частоты', () => {
  it('первый запуск разрешён', () => {
    expect(new SoundGate(rules).allow('shot', 0)).toBe(true);
  });

  it('повтор раньше промежутка отклоняется, после — разрешён', () => {
    const gate = new SoundGate(rules);
    gate.allow('shot', 1000);

    expect(gate.allow('shot', 1099)).toBe(false);
    expect(gate.allow('shot', 1100)).toBe(true);
  });

  it('отклонённый запуск не сдвигает отсчёт', () => {
    const gate = new SoundGate(rules);
    gate.allow('shot', 0);
    gate.allow('shot', 90);

    expect(gate.allow('shot', 100)).toBe(true);
  });

  it('у каждого звука свой отсчёт', () => {
    const gate = new SoundGate(rules);
    gate.allow('shot', 0);

    expect(gate.allow('win', 1)).toBe(true);
  });

  it('звук без ограничения запускается сколько угодно раз подряд', () => {
    const gate = new SoundGate(rules);

    expect([gate.allow('win', 5), gate.allow('win', 5), gate.allow('win', 5)]).toEqual([true, true, true]);
  });
});

describe('SoundGate: выключение и паузы', () => {
  it('выключенный игроком звук не запускается', () => {
    const gate = new SoundGate(rules);
    gate.setOn(false);

    expect(gate.audible).toBe(false);
    expect(gate.allow('win', 0)).toBe(false);
  });

  it('на паузе звук не запускается и возвращается после её снятия', () => {
    const gate = new SoundGate(rules);
    gate.pause('hidden');
    expect(gate.allow('win', 0)).toBe(false);

    gate.resume('hidden');
    expect(gate.allow('win', 1)).toBe(true);
  });

  it('звук молчит, пока действует хотя бы одна причина паузы', () => {
    const gate = new SoundGate(rules);
    gate.pause('ad');
    gate.pause('hidden');
    gate.resume('ad');
    expect(gate.audible).toBe(false);

    gate.resume('hidden');
    expect(gate.audible).toBe(true);
  });

  it('повторная пауза по той же причине снимается одним resume', () => {
    const gate = new SoundGate(rules);
    gate.pause('ad');
    gate.pause('ad');
    gate.resume('ad');

    expect(gate.audible).toBe(true);
  });

  it('снятие паузы не включает звук, выключенный игроком', () => {
    const gate = new SoundGate(rules);
    gate.setOn(false);
    gate.pause('ad');
    gate.resume('ad');

    expect(gate.audible).toBe(false);
    expect(gate.on).toBe(false);
  });

  it('запуск, отклонённый на паузе, не занимает промежуток', () => {
    const gate = new SoundGate(rules);
    gate.pause('hidden');
    gate.allow('shot', 0);
    gate.resume('hidden');

    expect(gate.allow('shot', 10)).toBe(true);
  });
});
