import { describe, expect, it } from 'vitest';
import credits from '../docs/CREDITS.md?raw';
import { SOUND_FEEL } from './feel';

/** Строки таблицы раздела: первая ячейка — имя, остальные — исходник, пак, автор и лицензия. */
function rows(heading: string): Map<string, string[]> {
  const start = credits.indexOf(`## ${heading}\n`);
  const next = credits.indexOf('\n## ', start + 1);
  const found = new Map<string, string[]>();
  if (start === -1) return found;
  for (const line of credits.slice(start, next === -1 ? undefined : next).split('\n')) {
    if (!line.startsWith('|')) continue;
    const [id, ...rest] = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (id && !/^-+$/.test(id) && rest[0] !== 'Исходный файл') found.set(id, rest);
  }
  return found;
}

// Сам исходник сверяет `npm run sfx`: он знает таблицу SOUNDS. Здесь — что ни один звук игры не остался без строки.
/** Звуки с файлом; у группы (`variants`) своего файла нет, и строки о ней быть не должно. */
const withFile = Object.entries(SOUND_FEEL)
  .filter(([, rule]) => !('variants' in rule))
  .map(([id]) => id);

describe('docs/CREDITS.md', () => {
  const sounds = rows('Звуки');

  it.each(withFile)('у звука %s указаны исходник, пак, автор и лицензия', (id) => {
    const row = sounds.get(id);
    expect(row).toBeDefined();
    expect(row).toHaveLength(4);
    for (const cell of row!) expect(cell).not.toBe('');
  });

  it('в таблице нет звуков, которых нет в игре', () => {
    expect([...sounds.keys()].sort()).toEqual([...withFile].sort());
  });
});
