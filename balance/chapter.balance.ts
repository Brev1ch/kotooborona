import { it } from 'vitest';
import { cats, economy, enemies, gear, levels } from '../src/data';
import type { LevelConfig } from '../src/data';
import { BOARD_H, BOARD_W } from '../src/layout';
import { reportLevel, type LevelReport } from '../src/systems/Bot';
import type { BattleConfigs } from '../src/systems/Simulation';

// Отчёт о балансе главы: бот проходит каждый уровень RUNS раз, таблица печатается в консоль.
//   npm run balance                 — отчёт по levels.json как есть
//   RUNS=200 SEED=1000 npm run balance — больше прогонов и другие зёрна
//   TUNE=1 npm run balance          — для каждого уровня подбирает hpMult под целевую долю побед бота (TARGET_WIN)
//                                     и печатает найденные значения; в levels.json их нужно перенести вручную

const RUNS = Number(process.env.RUNS ?? 60);
/** Первое зерно: другое число — другие бои, так проверяется, что подбор не подогнан под одни и те же прогоны. */
const SEED = Number(process.env.SEED ?? 1);
const configs: BattleConfigs = { cats, enemies, economy, gear, levels, board: { width: BOARD_W, height: BOARD_H } };

/**
 * Доля побед бота по уровням главы. Жизней три: бой почти всегда кончается либо без потерь, либо поражением,
 * поэтому подбор идёт по победам — обычный игрок проходит каждый уровень, а три звезды достаются хорошей игре.
 */
const TARGET_WIN = [0.98, 0.97, 0.96, 0.95, 0.94, 0.93, 0.91, 0.9, 0.89, 0.88];

function row(number: number, level: LevelConfig, report: LevelReport): string {
  const [lost, one, two, three] = report.stars;
  const built = report.avgBuilt;
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
    pad(`${built.shop.toFixed(1)}/${built.mine.toFixed(1)}/${built.altar.toFixed(1)}`, 11),
    pad(report.avgUpgrades.toFixed(1), 5),
    pad(report.avgSales.toFixed(1), 5),
    pad(report.avgLateSummons.toFixed(1), 6),
    pad(report.avgOverLimit.toFixed(1), 6),
    pad(report.avgMineCrystals.toFixed(1), 5),
    pad(report.avgShopGold.toFixed(0), 5),
    pad(report.avgMeteors.toFixed(1), 6),
  ].join(' | ');
}

const HEADER =
  ' № | уровень   |  hp×  | побед | звёзд | 3/2/1/пораж. | потери | время | кот   | гибр. | лав/шах/алт | улуч. | прод. | приз/в | сверх  | крист | доход | метеор';
const LEGEND = [
  'лав/шах/алт — сколько лавок, шахт и алтарей бот ставит за бой; улуч. — улучшений; прод. — продано котов и строений;',
  'приз/в — призывов за волну в последней трети уровня; сверх — призывов сверх лимита за бой;',
  'крист — кристаллов со шахт за бой; доход — монет с лавок за бой; метеор — метеоров за бой.',
].join('\n');

/** Подбирает hpMult делением пополам: чем живучее враги, тем реже бот побеждает. */
function tune(level: LevelConfig, target: number): LevelConfig {
  let low = 0.3;
  let high = 6;
  for (let i = 0; i < 9; i++) {
    const middle = (low + high) / 2;
    const { winRate } = reportLevel({ ...level, hpMult: middle }, configs, RUNS, SEED);
    if (winRate > target) low = middle;
    else high = middle;
  }
  return { ...level, hpMult: Math.round(((low + high) / 2) * 20) / 20 };
}

it('отчёт о балансе главы', () => {
  const lines = [HEADER];
  levels.levels.forEach((source, index) => {
    const level = process.env.TUNE ? tune(source, TARGET_WIN[index]) : source;
    lines.push(row(index + 1, level, reportLevel(level, configs, RUNS, SEED)));
  });
  console.log(`\nБот, ${RUNS} прогонов на уровень${process.env.TUNE ? ', hpMult подобран' : ''}\n${lines.join('\n')}\n\n${LEGEND}\n`);
});
