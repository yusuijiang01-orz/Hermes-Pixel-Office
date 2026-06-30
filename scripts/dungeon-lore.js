// ============================================================
// 叙事层：像素小地牢 -- 文案与叙事内容
// 作者：小文 | 日期：2026-07-01
// 用途：嵌入 office-scene.js / core.js 的地牢渲染管线
// ============================================================

const DUNGEON_LORE = {
  // 地牢名称（用于标题/入口提示）
  name: "公司洗手间后的密室",
  subtitle: "传说这里是公司最早的文件归档间，后来堆满了废弃原型机和测试设备。",

  // 各楼层主题与入场文案
  floors: [
    {
      level: 1,
      entrance: "你推开洗手间的门——后面不是墙。",
      theme: "废弃原型机",
      description: "地上散落着被砍掉的技能树打印件和吃灰的测试手柄。",
      enemyName: "废案怪",
      enemyDesc: "一堆被砍掉的技能树打印件，偶尔还会蠕动。",
      deathText: "你的意识回到了茶水间。咖啡机好像刚煮好一杯……",
      victoryText: "归档完毕。这些废案至少该进博物馆了。",
    },
    {
      level: 2,
      entrance: "走廊尽头有一台吃灰的显示器，屏幕自己亮了。",
      theme: "测试设备区",
      description: "满地的网线像藤蔓一样缠在旧服务器机柜上。",
      enemyName: "网线蛇",
      enemyDesc: "纠缠在一起的以太网线，通电后会发出微弱的嗡鸣。",
      deathText: "网线缠住了你。你在蓝屏中失去了意识……",
      victoryText: "拔掉最后一根网线。服务器安静了。",
    },
    {
      level: 3,
      entrance: "机房深处传来键盘敲击声——但这里明明没人。",
      theme: "幽灵机房",
      description: "一排排显示器闪烁着未完成的代码。某个IDE还在自动补全。",
      enemyName: "幽灵开发者",
      enemyDesc: "一个半透明的身影，还在试图修一个永远修不完的bug。",
      deathText: "幽灵拍了拍你的肩——然后穿了过去。你醒了，在工位上。",
      victoryText: "幽灵终于合上了那个IDE。它说了一句'谢谢'，消散了。",
    },
  ],

  // 通用死亡文案池
  deaths: [
    "你倒下了。意识回到工位，发现咖啡已经凉了。",
    "屏幕一黑。你在办公椅上惊醒——还好只是做梦。",
    "HP归零。鱼缸里的鱼看了你一眼，游走了。",
    "被击倒了。微波炉突然叮了一声，把你拉回了现实。",
  ],

  // 通用胜利/通关文案
  victories: [
    "所有敌人清除。地面裂开，露出一条向上的楼梯。",
    "最后一声回响消失。寂静中，你听到了远处的键盘声。",
    "战斗结束。地上留下了一些发光的碎片——像是被遗忘的数据。",
  ],

  // 玩家攻击时的浮动文字（命中/暴击）
  hitTexts: {
    normal: ["砰!", "铛!", "咔!", "嗤!"],
    crit: ["暴击!", "穿透!", "粉碎!", "终结!"],
    miss: ["擦过!", "落空!", "偏了!"],
  },

  // 进入地牢前的办公室NPC台词
  officeDialogues: {
    default: [
      "阿默：洗手间后面的门？我上次看到它亮着灯……进去看看？",
      "小韩：先做Demo验证手感，别管剧情——打完再说。",
      "小研：这个区域适合做早期战斗教学，敌人少、节奏慢。",
      "小岩：DNF那种地牢入口，玩家第一眼就能get。",
    ],
    lowHp: [
      "阿默：血少了就撤吧，洗手间门口随时能跑。",
      "小文：活着回来，还有文案要写呢。",
    ],
    firstEntry: [
      "阿默：好吧，洗手间后面确实有个地牢。走吧。",
      "小韩：这就是我们的像素风ARPG入口。",
    ],
  },

  // 柯基的随机评论（当小文的柯基在场时触发）
  corgiComments: [
    "柯基歪了歪头，好像在问你要去哪。",
    "柯基嗅了嗅洗手间的门缝——尾巴摇了一下。",
    "柯基趴在门口，不肯让你一个人进去。",
  ],
};


// ============================================================
// 地牢HUD叙事文案（嵌入drawDungeonUI）
// ============================================================
function getDungeonTitle(floor) {
  if (!floor) floor = 1;
  const f = DUNGEON_LORE.floors.find(x => x.level === floor);
  if (!f) return `LV.${floor}`;
  return `LV.${floor} · ${f.theme}`;
}

function getEntranceText(floor) {
  const f = DUNGEON_LORE.floors.find(x => x.level === floor);
  return f ? f.entrance : "你继续深入……";
}

function getRandomDeath() {
  const pool = DUNGEON_LORE.deaths;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRandomVictory() {
  const pool = DUNGEON_LORE.victories;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRandomHitText(type) {
  const pool = DUNGEON_LORE.hitTexts[type] || DUNGEON_LORE.hitTexts.normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRandomOfficeDialogue(category) {
  const pool = DUNGEON_LORE.officeDialogues[category] || DUNGEON_LORE.officeDialogues.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRandomCorgiComment() {
  const pool = DUNGEON_LORE.corgiComments;
  return pool[Math.floor(Math.random() * pool.length)];
}
