import { it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../src/data';
import type { LevelConfig } from '../src/data';
import { BOARD_H, BOARD_W } from '../src/layout';
import { reportLevel, type LevelReport } from '../src/systems/Bot';
import type { BattleConfigs } from '../src/systems/Simulation';

// Отчёт о балансе главы: бот проходит каждый уровень RUNS раз, таблица печатается в консоль.
//   npm run balance                 — отчёт по levels.json как есть
//   RUNS=200 SEED=1000 npm run balance — больше прогонов и другие зёрна
//   TUNE=1 npm run balance          — для каждого уровня подбирает hpMult под целевое среднее число звёзд (TARGET_STARS)
//                                     и печатает найденные значения; в levels.json их нужно перенести вручную

const RUNS = Number(process.env.RUNS ?? 60);
/** Первое зерно: другое число — другие бои, так проверяется, что подбор не подогнан под одни и те же прогоны. */
const SEED = Number(process.env.SEED ?? 1);
const configs: BattleConfigs = { cats, enemies, economy, gear, levels, board: { width: BOARD_W, height: BOARD_H } };

/** Среднее число звёзд бота по уровням главы: от «почти всегда три» до «чаще одна-две, иногда поражение». */
const TARGET_STARS = [2.85, 2.7, 2.55, 2.4, 2.25, 2.1, 1.95, 1.8, 1.65, 1.5];

function row(number: number, level: LevelConfig, report: LevelReport): string {
  const [lost, one, two, three] = report.stars;
  const pad = (value: string | number, width: number): string => String(value).padStart(width);
  return [
    pad(number, 2),
    level.id.padEnd(9),
    pad(level.hpMult.toFixed(2), 5),
    pad(`${Math.round(report.winRate * 100)}%`, 5),
    pad(report.avgStars.toFixed(2), 5),
    pad(`${three}/${two}/${one}/${lost}`, 12),
    pad(report.avgLivesLost.toFixed(1), 6),
    pad(`${Math.floor(report.avgTime / 60)}:${String(Math.round(report.avgTime % 60)).padStart(2, '0')}`, 5),
    pad(report.avgTopCatLevel.toFixed(1), 5),
    pad(report.avgHybrids.toFixed(1), 5),
  ].join(' | ');
}

const HEADER = ' № | уровень   |  hp×  | побед | звёзд | 3/2/1/пораж. | потери | время | кот   | гибр.';

/** Подбирает hpMult делением пополам: чем живучее враги, тем меньше звёзд у бота. */
function tune(level: LevelConfig, target: number): LevelConfig {
  let low = 0.3;
  let high = 6;
  for (let i = 0; i < 9; i++) {
    const middle = (low + high) / 2;
    const { avgStars } = reportLevel({ ...level, hpMult: middle }, configs, RUNS, SEED);
    if (avgStars > target) low = middle;
    else high = middle;
  }
  return { ...level, hpMult: Math.round(((low + high) / 2) * 20) / 20 };
}

it('отчёт о балансе главы', () => {
  const lines = [HEADER];
  levels.levels.forEach((source, index) => {
    const level = process.env.TUNE ? tune(source, TARGET_STARS[index]) : source;
    lines.push(row(index + 1, level, reportLevel(level, configs, RUNS, SEED)));
  });
  console.log(`\nБот, ${RUNS} прогонов на уровень${process.env.TUNE ? ', hpMult подобран' : ''}\n${lines.join('\n')}\n`);
});
