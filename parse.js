export const EVENT_TYPES = [
  ["money", "Money"],
  ["mining", "Mining"],
  ["building", "Building"],
  ["combat", "Combat"],
  ["exploration", "Exploration"],
  ["inventory", "Inventory"],
  ["achievement", "Achievement"],
  ["death", "Death"],
  ["player", "Player"],
  ["trade", "Trade"],
  ["note", "Note"],
  ["goal", "Goal"],
];

const TYPE_CATEGORY = {
  money: "Miscellaneous",
  mining: "Mining",
  building: "Construction",
  combat: "Combat",
  exploration: "Exploration",
  inventory: "Inventory",
  achievement: "Progress",
  death: "Combat",
  player: "Social",
  trade: "Trading",
  note: "Notes",
  goal: "Goals",
};

const AMOUNT = /(?<sign>\+|-)?(?<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?<suffix>[kKmMbB])?/;
const STACKS = /(?<num>\d+)\s+stacks?\s+of\s+(?<item>[a-zA-Z][a-zA-Z0-9_ ]{0,40})/i;
const ITEM_QTY = /(?<verb>made|mined|found|got|collected|gained|sold|used|spent|lost)\s+(?<num>\d{1,3}(?:,\d{3})+|\d+)\s+(?<item>[a-zA-Z][a-zA-Z0-9_ ]{0,32})/i;
const COUNT_WORDS = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3 };

function scale(number, suffix) {
  let value = Number(String(number).replace(/,/g, ""));
  if (suffix) value *= { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[suffix.toLowerCase()];
  return value;
}

function money(text) {
  const spend = /\b(spent|spend|paid|bought|cost|lost)\b/i.test(text);
  const income = /\b(earned|sold for|received|gained|profit|income)\b/i.test(text);
  const match = text.match(AMOUNT);
  if (!match) return null;
  if (!spend && !income && !match.groups.suffix && !match.groups.sign) return null;
  let value = scale(match.groups.num, match.groups.suffix);
  if (match.groups.sign === "-") return -value;
  if (match.groups.sign === "+") return value;
  if (spend && !income) return -value;
  if (income && !spend) return value;
  return spend ? -value : value;
}

function eventType(text) {
  const lowered = text.toLowerCase();
  const rules = [
    ["death", ["died", "death", "deaths"]],
    ["player", ["joined", "left the", "logged on"]],
    ["trade", ["sold", "bought", "traded", "trade"]],
    ["building", ["built", "build", "expanded", "constructed", "castle", "farm", "base"]],
    ["mining", ["mined", "mining", "diamonds", "ancient debris"]],
    ["combat", ["pvp", "won", "lost a fight", "killed"]],
    ["exploration", ["found a", "explored", "discovered", "location", "nether", "the end"]],
    ["achievement", ["elytra", "unlocked", "achievement"]],
    ["goal", ["goal"]],
    ["inventory", ["inventory", "picked up"]],
    ["money", ["spent", "earned", "paid", "balance"]],
  ];
  for (const [name, words] of rules) {
    if (words.some((word) => lowered.includes(word))) return name;
  }
  return "note";
}

function item(text) {
  const stacks = text.match(STACKS);
  if (stacks) {
    let delta = Number(stacks.groups.num) * 64;
    if (/\b(sold|used|spent|lost)\b/i.test(text)) delta = -delta;
    return [stacks.groups.item.trim().replace(/\.$/, ""), delta];
  }
  const found = text.match(ITEM_QTY);
  if (!found) return /\belytra\b/i.test(text) ? ["Elytra", 1] : [null, null];
  let delta = Number(found.groups.num.replace(/,/g, ""));
  if (["sold", "used", "spent", "lost"].includes(found.groups.verb.toLowerCase())) delta = -delta;
  return [found.groups.item.trim().replace(/\.$/, ""), delta];
}

function player(text, known = []) {
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    if (name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return name;
  }
  const joined = text.match(/\b([A-Z][A-Za-z0-9_]{1,20})\s+(joined|left)\b/);
  return joined ? joined[1] : null;
}

function deaths(text) {
  if (!/\b(died|death|deaths)\b/i.test(text)) return null;
  const numbered = text.match(/\b(\d+)\b/);
  if (numbered) return Number(numbered[1]);
  for (const [word, count] of Object.entries(COUNT_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return count;
  }
  return 1;
}

export function parseQuick(text, players = []) {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Enter what happened." };
  let type = eventType(raw);
  const amount = money(raw);
  const [itemName, itemDelta] = item(raw);
  if (amount != null && type === "note") type = "money";
  if (itemDelta != null && (type === "note" || type === "money")) type = itemDelta > 0 ? "mining" : "inventory";
  return {
    ok: true,
    source: "rules",
    eventType: type,
    category: TYPE_CATEGORY[type],
    title: raw.slice(0, 120),
    description: raw,
    amount,
    itemName,
    itemDelta,
    playerName: player(raw, players),
    deathCount: deaths(raw),
  };
}
