# Источники и лицензии

Всё чужое, что вошло в игру: откуда взято, чьё и на каких условиях.

## Звуки

Таблицы звуков и музыки сверяет `npm run sfx`: звук, у которого здесь нет строки, или строка не совпадает с таблицей `SOUNDS`
в `scripts/sfx.mjs`, не собирается. Исходный файл — путь внутри `assets-src/sfx/`. Файлы обрезаны, сведены в моно
и сжаты этим же скриптом.

| Звук | Исходный файл | Пак | Автор | Лицензия |
| --- | --- | --- | --- | --- |
| click | `interface-sounds/Audio/click_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| summon | `interface-sounds/Audio/maximize_008.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| merge | `interface-sounds/Audio/confirmation_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| hybrid | `interface-sounds/Audio/confirmation_002.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| shot | `interface-sounds/Audio/pluck_001.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| shotFire | `sci-fi-sounds/Audio/thrusterFire_000.ogg` | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| shotWater | `sci-fi-sounds/Audio/slime_000.ogg` | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| shotEarth | `impact-sounds/Audio/impactMining_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| shotAir | `rpg-audio/Audio/cloth1.ogg` | [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney (kenney.nl) | CC0 1.0 |
| hit | `impact-sounds/Audio/impactSoft_medium_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| enemyDeath | `impact-sounds/Audio/impactPunch_medium_001.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| coins | `rpg-audio/Audio/handleCoins2.ogg` | [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney (kenney.nl) | CC0 1.0 |
| lifeLost | `interface-sounds/Audio/error_006.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| meteor | `impact-sounds/Audio/impactPunch_heavy_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney (kenney.nl) | CC0 1.0 |
| win | `digital-audio/Audio/zapThreeToneUp.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney (kenney.nl) | CC0 1.0 |
| lose | `digital-audio/Audio/lowThreeTone.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney (kenney.nl) | CC0 1.0 |
| chest | `rpg-audio/Audio/doorOpen_1.ogg` | [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney (kenney.nl) | CC0 1.0 |

## Музыка

Треков в игре пока нет. Новый трек — строка в таблице `MUSIC` в `scripts/sfx.mjs` и строка здесь, в том же виде, что у звуков:
без неё `npm run sfx` трек не соберёт. Исходный файл — путь внутри `assets-src/music/`.

| Трек | Исходный файл | Пак | Автор | Лицензия |
| --- | --- | --- | --- | --- |

## Шрифты

| Шрифт | Автор | Лицензия |
| --- | --- | --- |
| Rubik | The Rubik Project Authors (github.com/googlefonts/rubik) | SIL Open Font License 1.1, текст — `public/assets/fonts/OFL-Rubik.txt` |
| Russo One | Jovanny Lemonad (jovanny.ru) | SIL Open Font License 1.1, текст — `public/assets/fonts/OFL-RussoOne.txt` |

## Лицензии

- CC0 1.0 — Creative Commons Zero, общественное достояние: https://creativecommons.org/publicdomain/zero/1.0/
- SIL Open Font License 1.1: https://openfontlicense.org
