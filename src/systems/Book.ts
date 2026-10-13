import type { CatsConfig, ElementId } from '../data/types';

/** Страница книги котов. */
export interface BookEntry {
  element: ElementId;
  /** Базовые коты известны с начала игры, гибрид — после первого получения. */
  known: boolean;
  /** Пара базовых стихий, из которых получается гибрид; у базового кота — null. */
  recipe: [ElementId, ElementId] | null;
}

/** Все коты игры в порядке конфига: сначала базовые, затем гибриды. */
export function bookEntries(cats: CatsConfig, discovered: (element: ElementId) => boolean): BookEntry[] {
  return (Object.keys(cats.elements) as ElementId[]).map((element) => {
    const recipe = cats.elements[element].from ?? null;
    return { element, known: recipe === null || discovered(element), recipe };
  });
}
