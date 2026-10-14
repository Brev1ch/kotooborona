# Рецепт стиля — Кото-оборона

Эталон: огненный кот 1-го уровня, сгенерирован 14.10.2026 в SeaArt.
Все персонажи игры генерируются по этому рецепту, меняется только блок «Стихия».

## Настройки

| Параметр | Значение |
| --- | --- |
| Сервис | SeaArt (seaart.ai), режим Txt2Img |
| Модель (Checkpoint) | Z Image Turbo |
| Sampler | DPM++ 2M Karras |
| Steps | 20 |
| CFG Scale | 7 |
| Clip Skip | 2 |
| Seed эталона | 765894880 |
| Размер эталона | 688×1024 (дальше генерировать 1024×1024) |

Лицензия модели и условия SeaArt проверены: [дата, ссылка, скриншот — заполнить]

## Промпт

Структура: [ОБЩЕЕ НАЧАЛО] + [СТИХИЯ] + [ОБЩИЙ КОНЕЦ].

**Общее начало:**
```
masterpiece, best quality, game asset, single character, cute chibi cat mage,
```

**Стихия (огонь — эталон):**
```
fire element, bright orange fur with red tips, big flame tuft on the head,
tiny red cape with a round amber brooch, small flame on the tip of the tail,
```

**Общий конец:**
```
big head, small round body, huge shiny eyes, happy confident smile,
sitting pose, full body, front three-quarter view, centered,
thick dark brown outline, flat cel shading, soft simple shapes,
vibrant saturated colors, clean vector style, mobile game character,
plain white background
```

**Negative prompt:**
```
realistic, photo, 3d render, detailed fur texture, noise, grain, texture,
paper texture, complex background, scenery, shadow on ground,
gradient background, text, watermark, signature, logo, multiple characters,
cropped, out of frame, extra limbs, extra tails, deformed, blurry, lowres,
wizard hat, crown, weapon, staff
```

## Правила стиля

- Голова крупная, тело маленькое, глаза огромные, рот «w».
- Контур толстый, тёмно-коричневый, одинаковой толщины у всех.
- Заливка плоская, без шума и текстуры.
- Стихия видна по двум признакам: цвет шерсти + «хохолок» на голове
  (и тот же символ на кончике хвоста).
- Плащ цвета стихии с круглой брошью.
- Шляпы и короны нет: уровень кота показывает игра.
- Проверка: картинка, уменьшенная до 64 px, должна читаться.

## Стихии (блок «Стихия»)

| Стихия | Шерсть | Хохолок и хвост | Плащ |
| --- | --- | --- | --- |
| Огонь (эталон) | ярко-оранжевая с красными кончиками | пламя | красный |
| Вода | | | |
| Земля | | | |
| Воздух | | | |
| Пар | | | |
| Лава | | | |
| Гроза | | | |
| Лёд | | | |
| Болото | | | |
| Песок | | | |

## Готовые картинки

| Персонаж | Seed | Файл | Готово |
| --- | --- | --- | --- |
| Огненный кот | 765894880 | | эталон |
