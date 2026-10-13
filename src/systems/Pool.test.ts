import { describe, expect, it, vi } from 'vitest';
import { Pool } from './Pool';

function numbered() {
  let next = 0;
  const create = vi.fn(() => ({ id: next++ }));
  return { pool: new Pool(create), create };
}

describe('Pool', () => {
  it('пока свободных нет, создаёт новые объекты', () => {
    const { pool, create } = numbered();

    expect(pool.acquire()).toEqual({ id: 0 });
    expect(pool.acquire()).toEqual({ id: 1 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(pool.size).toBe(2);
  });

  it('возвращённый объект выдаёт снова, а не создаёт новый', () => {
    const { pool, create } = numbered();
    const first = pool.acquire();
    pool.release(first);

    expect(pool.acquire()).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('не создаёт объекты заранее', () => {
    const { pool, create } = numbered();

    expect(create).not.toHaveBeenCalled();
    expect(pool.size).toBe(0);
  });

  it('считает свободные объекты', () => {
    const { pool } = numbered();
    const a = pool.acquire();
    const b = pool.acquire();
    pool.release(a);
    pool.release(b);
    expect(pool.idleCount).toBe(2);

    pool.acquire();
    expect(pool.idleCount).toBe(1);
    expect(pool.size).toBe(2);
  });

  it('повторный возврат не выдаёт один объект двум владельцам', () => {
    const { pool } = numbered();
    const item = pool.acquire();
    pool.release(item);
    pool.release(item);

    expect(pool.acquire()).toBe(item);
    expect(pool.acquire()).not.toBe(item);
  });

  it('число созданных объектов равно наибольшему числу занятых одновременно', () => {
    const { pool } = numbered();
    for (let round = 0; round < 5; round++) {
      const busy = [pool.acquire(), pool.acquire(), pool.acquire()];
      busy.forEach((item) => pool.release(item));
    }

    expect(pool.size).toBe(3);
  });
});
