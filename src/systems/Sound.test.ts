import { describe, expect, it } from 'vitest';
import { MusicMixer, SoundGate, trackAction } from './Sound';

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

describe('SoundGate: шанс и обязательный звук', () => {
  const chancy = { purr: { minIntervalMs: 3000, chance: 0.5 }, always: { minIntervalMs: 0 } };

  it('звук с шансом звучит, только когда выпало меньше шанса', () => {
    const gate = new SoundGate(chancy);
    expect(gate.allow('purr', 0, 0.7)).toBe(false);
    expect(gate.allow('purr', 10, 0.2)).toBe(true);
  });

  it('не прозвучавший звук промежуток не начинает, прозвучавший — начинает', () => {
    const gate = new SoundGate(chancy);
    expect(gate.allow('purr', 0, 0.9)).toBe(false);
    expect(gate.allow('purr', 100, 0.1)).toBe(true);
    expect(gate.allow('purr', 2000, 0.1)).toBe(false);
    expect(gate.allow('purr', 3100, 0.1)).toBe(true);
  });

  it('без шанса звук звучит при любом числе', () => {
    expect(new SoundGate(chancy).allow('always', 0, 0.99)).toBe(true);
  });

  it('обязательный звук не смотрит ни на шанс, ни на промежуток, но молчит, если звук выключен', () => {
    const gate = new SoundGate(chancy);
    expect(gate.allow('purr', 0, 0.1)).toBe(true);
    expect(gate.allow('purr', 10, 0.99, true)).toBe(true);
    gate.setOn(false);
    expect(gate.allow('purr', 20, 0, true)).toBe(false);
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

  it('потеря фокуса окном глушит звук и музыку, пока фокус не вернётся, и не снимает паузу рекламы', () => {
    const gate = new SoundGate(rules);
    gate.pause('ad');
    gate.pause('blur');
    gate.resume('blur');
    expect([gate.audible, gate.musicAudible]).toEqual([false, false]);
    gate.resume('ad');
    gate.pause('blur');
    expect([gate.audible, gate.musicAudible]).toEqual([false, false]);
    gate.resume('blur');
    expect([gate.audible, gate.musicAudible]).toEqual([true, true]);
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

describe('SoundGate: музыка отдельно от звуков', () => {
  it('по умолчанию включено и то, и другое', () => {
    const gate = new SoundGate(rules);
    expect([gate.on, gate.musicOn, gate.audible, gate.musicAudible, gate.paused]).toEqual([true, true, true, true, false]);
  });

  it('выключенные звуки музыке не мешают, и наоборот', () => {
    const gate = new SoundGate(rules);
    gate.setOn(false);
    expect([gate.audible, gate.musicAudible]).toEqual([false, true]);
    expect(gate.allow('win', 0)).toBe(false);

    gate.setOn(true);
    gate.setMusicOn(false);
    expect([gate.audible, gate.musicAudible]).toEqual([true, false]);
    expect(gate.allow('win', 0)).toBe(true);
  });

  it('пауза глушит и звуки, и музыку, пока не сняты все причины', () => {
    const gate = new SoundGate(rules);
    gate.pause('hidden');
    gate.pause('ad');
    expect([gate.audible, gate.musicAudible, gate.paused]).toEqual([false, false, true]);

    gate.resume('ad');
    expect([gate.musicAudible, gate.paused]).toEqual([false, true]);
    gate.resume('hidden');
    expect([gate.audible, gate.musicAudible, gate.paused]).toEqual([true, true, false]);
  });

  it('пауза настройки игрока не меняет', () => {
    const gate = new SoundGate(rules);
    gate.setMusicOn(false);
    gate.pause('ad');
    gate.resume('ad');
    expect([gate.on, gate.musicOn]).toEqual([true, false]);
  });
});

describe('MusicMixer: плавная смена трека', () => {
  type Track = 'menu' | 'battle';

  it('пока ничего не выбрано — тишина', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.step(500);
    expect([mixer.current, mixer.active, mixer.level('menu')]).toEqual([null, [], 0]);
  });

  it('трек проявляется за время перехода и дальше держит полную громкость', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.play('menu');
    expect(mixer.level('menu')).toBe(0);
    mixer.step(250);
    expect(mixer.level('menu')).toBeCloseTo(0.25);
    mixer.step(750);
    expect(mixer.level('menu')).toBe(1);
    mixer.step(5000);
    expect(mixer.level('menu')).toBe(1);
  });

  it('при смене прежний трек затихает, новый проявляется; затихший уходит из микшера', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.play('menu');
    mixer.step(1000);
    mixer.play('battle');
    expect(mixer.current).toBe('battle');
    mixer.step(400);
    expect(mixer.level('menu')).toBeCloseTo(0.6);
    expect(mixer.level('battle')).toBeCloseTo(0.4);
    expect(mixer.active.sort()).toEqual(['battle', 'menu']);
    mixer.step(600);
    expect(mixer.active).toEqual(['battle']);
    expect(mixer.level('battle')).toBe(1);
  });

  it('вернуться к затихающему треку можно с середины: он проявляется с того уровня, где был', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.play('menu');
    mixer.step(1000);
    mixer.play('battle');
    mixer.step(300);
    mixer.play('menu');
    mixer.step(100);
    expect(mixer.level('menu')).toBeCloseTo(0.8);
    expect(mixer.level('battle')).toBeCloseTo(0.2);
  });

  it('тот же трек повторно — без перезапуска', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.play('menu');
    mixer.step(700);
    mixer.play('menu');
    expect(mixer.level('menu')).toBeCloseTo(0.7);
  });

  it('null — музыка плавно умолкает', () => {
    const mixer = new MusicMixer<Track>(1000);
    mixer.play('menu');
    mixer.step(1000);
    mixer.play(null);
    mixer.step(500);
    expect(mixer.level('menu')).toBeCloseTo(0.5);
    mixer.step(500);
    expect(mixer.active).toEqual([]);
  });

  it('без времени перехода трек меняется сразу', () => {
    const mixer = new MusicMixer<Track>(0);
    mixer.play('menu');
    mixer.step(16);
    mixer.play('battle');
    mixer.step(16);
    expect([mixer.level('menu'), mixer.level('battle')]).toEqual([0, 1]);
  });
});

describe('trackAction: что сделать со звуком трека', () => {
  it('трек в микшере и музыка слышна: запустить, а стоящий на паузе — продолжить', () => {
    expect(trackAction(0.5, true, false, false)).toBe('play');
    expect(trackAction(0.5, true, false, true)).toBe('resume');
    expect(trackAction(0.5, true, true, false)).toBeNull();
  });

  it('музыка замолчала: играющий трек встаёт на паузу, а не останавливается', () => {
    expect(trackAction(1, false, true, false)).toBe('pause');
    expect(trackAction(1, false, false, true)).toBeNull();
    expect(trackAction(1, false, false, false)).toBeNull();
  });

  it('трек ушёл из микшера: остановить, даже если он стоял на паузе', () => {
    expect(trackAction(0, true, true, false)).toBe('stop');
    expect(trackAction(0, false, false, true)).toBe('stop');
    expect(trackAction(0, true, false, false)).toBeNull();
  });
});
