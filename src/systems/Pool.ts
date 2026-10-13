/**
 * Пул объектов: вместо того чтобы создавать и удалять снаряды, монеты и всплывающие числа,
 * освободившийся объект возвращается сюда и выдаётся снова. В бою это убирает рывки от создания объектов и сборки мусора.
 */
export class Pool<T> {
  private readonly idle: T[] = [];
  private created = 0;

  /** `create` вызывается, только когда свободных объектов нет. */
  constructor(private readonly create: () => T) {}

  /** Свободный объект или новый, если свободных нет. Привести его в нужное состояние — дело вызывающего. */
  acquire(): T {
    const item = this.idle.pop();
    if (item !== undefined) return item;
    this.created++;
    return this.create();
  }

  /** Возвращает объект в пул. Повторный возврат того же объекта ничего не меняет. */
  release(item: T): void {
    if (!this.idle.includes(item)) this.idle.push(item);
  }

  /** Сколько объектов создано за всё время. */
  get size(): number {
    return this.created;
  }

  /** Сколько объектов сейчас свободно. */
  get idleCount(): number {
    return this.idle.length;
  }
}
