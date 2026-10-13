export const ru = {
  'game.title': 'Кото-оборона',
  'menu.play': 'Играть',

  'hud.gold': 'Монеты',
  'hud.crystals': 'Кристаллы',
  'hud.wave': 'Волна',
  'hud.lives': 'Жизни',
  'hud.waveValue': '{current}/{total}',

  'wave.soon': 'Волна {wave} скоро',
  'wave.bossSoon': 'Крыса-командир! Волна {wave} скоро',

  'reward.gold': '+{gold}',
  'reward.goldCrystals': '+{gold}  ◆{crystals}',

  'result.win': 'Уровень пройден',
  'result.lose': 'Замок пал',
  'result.noLosses': 'Ни одна мышь не прошла!',
  'result.livesLost': 'Потеряно жизней: {lost}',
  'result.starsHint': 'Для 3 звёзд пройди без потерь',
  'result.reached': 'Коты продержались до волны {wave} из {total}',
  'result.retry': 'Ещё раз',
  'result.menu': 'В меню',

  'summon.button': 'Призвать',

  'meteor.button': 'Метеор',
  'meteor.ready': 'готов',
  'meteor.cooldown': '{seconds} с',
  'meteor.aim': 'коснись поля',

  'merge.maxLevel': 'Максимум {level} ур.',
  'merge.noCrystal': 'Нужен кристалл',
  'merge.ritual': 'Кот проводит ритуал',
  'merge.preview': '{name} {level}',
  'merge.previewUnknown': '??? новый кот',
  'merge.crystalCost': '{text} · ◆{cost}',

  'book.discovered': 'Открыт новый кот: {name}',

  'level.opushka': 'Опушка',

  'cat.fire': 'Огненный',
  'cat.water': 'Водный',
  'cat.earth': 'Каменный',
  'cat.air': 'Ветряной',
  'cat.steam': 'Паровой',
  'cat.lava': 'Лавовый',
  'cat.storm': 'Грозовой',
  'cat.ice': 'Ледяной',
  'cat.swamp': 'Болотный',
  'cat.sand': 'Песчаный',

  'cat.fire.desc': 'поджигает',
  'cat.water.desc': 'замедляет',
  'cat.earth.desc': 'мощный удар',
  'cat.air.desc': 'быстрые атаки',
  'cat.steam.desc': 'урон по площади и замедление',
  'cat.lava.desc': 'взрыв лавы с поджогом',
  'cat.storm.desc': 'молния по цепочке',
  'cat.ice.desc': 'замораживает',
  'cat.swamp.desc': 'яд накапливается',
  'cat.sand.desc': 'буря бьёт всех в радиусе',

  'gear.staff.none': 'Без посоха',
  'gear.staff.fire': 'Огненный',
  'gear.staff.water': 'Водный',
  'gear.staff.earth': 'Каменный',
  'gear.staff.air': 'Ветряной',
  'gear.mantle.thrift': 'Бережливости',
  'gear.mantle.sorc': 'Чародея',
  'gear.amulet.alch': 'Алхимика',
  'gear.amulet.cry': 'Кристаллов',
  'gear.amulet.purse': 'Кошель',
};

export type StringKey = keyof typeof ru;
