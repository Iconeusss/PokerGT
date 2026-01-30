import type { Card as CardInterface } from "../DGLZ";

// 重新导出Card类型供本文件使用
type Card = CardInterface;

// 类型定义
interface CardType {
  type: string;
  typeRank: number;
  value: number;
  count: number;
}

type GetDGLZTypeFunc = (cards: Card[]) => CardType | null;
type CanBeatFunc = (played: Card[], last: Card[]) => boolean;

// AI上下文
interface AIContext {
  currentPlayer: number;
  passCount: number;
  playerCardCounts: number[];
}

// 辅助函数：判断是否为王牌
const isJoker = (card: Card) => card.rank === "joker" || card.rank === "JOKER";

// AI出牌主函数
export const playsByAI = (
  hand: Card[],
  last: Card[],
  ctx: AIContext,
  getDGLZType: GetDGLZTypeFunc,
  canBeat: CanBeatFunc,
): Card[] | null => {
  // 自由出牌
  if (!last || last.length === 0) {
    return freePlay(hand, getDGLZType);
  }

  // 跟牌
  return followPlay(hand, last, ctx, getDGLZType, canBeat);
};

// 自由出牌策略
const freePlay = (
  hand: Card[],
  getDGLZType: GetDGLZTypeFunc,
): Card[] | null => {
  const sorted = [...hand].sort((a, b) => a.value - b.value);

  // 1. 尝试出 5 张组合（顺子、葫芦、同花等）
  // 随机概率决定是否出 5 张组合（如果有的话）
  if (Math.random() > 0.3) {
    const fiveCard = findSmallestFiveCard(sorted, getDGLZType);
    if (fiveCard) return fiveCard;
  }

  // 2. 尝试出三条
  if (Math.random() > 0.4) {
    const triple = findSmallestTriple(sorted, getDGLZType, true); // true 表示尽量不拆四条
    if (triple) return triple;
  }

  // 3. 尝试出对子
  if (Math.random() > 0.5) {
    const pair = findSmallestPair(sorted, getDGLZType, true); // true 表示尽量不拆三条
    if (pair) return pair;
  }

  // 4. 出单张（优先选落单的牌）
  const single = findSmallestSingle(sorted, getDGLZType, true); // true 表示尽量不拆对子
  if (single) return single;

  // 兜底：如果上面的随机性都没中，按优先级再选一次不带随机的
  const tripleFallback = findSmallestTriple(sorted, getDGLZType, false);
  if (tripleFallback) return tripleFallback;

  const pairFallback = findSmallestPair(sorted, getDGLZType, false);
  if (pairFallback) return pairFallback;

  // 实在不行就出最小的单张
  if (sorted.length > 0) {
    return [sorted[0]];
  }

  return null;
};

// 跟牌策略
const followPlay = (
  hand: Card[],
  last: Card[],
  ctx: AIContext,
  getDGLZType: GetDGLZTypeFunc,
  canBeat: CanBeatFunc,
): Card[] | null => {
  const lastType = getDGLZType(last);
  if (!lastType) return null;

  const sorted = [...hand].sort((a, b) => a.value - b.value);

  // 策略：如果有人快跑完牌了，AI 应该更倾向于压牌
  const isSomeoneWinning = ctx.playerCardCounts.some(
    (count, idx) => idx !== ctx.currentPlayer && count <= 3,
  );

  // 根据牌数找对应的牌型
  switch (lastType.count) {
    case 1:
      return findBeatingCards(sorted, last, 1, canBeat, isSomeoneWinning);
    case 2:
      return findBeatingCards(sorted, last, 2, canBeat, isSomeoneWinning);
    case 3:
      return findBeatingCards(sorted, last, 3, canBeat, isSomeoneWinning);
    case 5:
      return findBeatingFiveCard(
        sorted,
        last,
        getDGLZType,
        canBeat,
        isSomeoneWinning,
      );
    default:
      return null;
  }
};

// 找最小的单张
const findSmallestSingle = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  noSplit: boolean = false,
): Card[] | null => {
  const normalCards = sorted.filter((c) => !isJoker(c));
  const groups = groupByValue(normalCards);

  // 1. 优先找真正的单张（不是对子或三条的一部分）
  for (const card of normalCards) {
    if (!noSplit || (groups[card.value] && groups[card.value].length === 1)) {
      const type = getDGLZType([card]);
      if (type) return [card];
    }
  }

  // 2. 如果没找到独立单张且允许拆分，则出最小的单张
  if (!noSplit) {
    if (normalCards.length > 0) return [normalCards[0]];

    // 没有普通牌就出王
    const jokers = sorted.filter(isJoker);
    if (jokers.length > 0) {
      return [jokers[0]];
    }
  }

  return null;
};

// 找最小的对子
const findSmallestPair = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  noSplit: boolean = false,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const groups = groupByValue(sorted.filter((c) => !isJoker(c)));

  // 1. 优先找真正的对子
  for (const [, cards] of Object.entries(groups).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    if (cards.length === 2 || (!noSplit && cards.length >= 2)) {
      const pair = cards.slice(0, 2);
      if (getDGLZType(pair)) return pair;
    }
  }

  // 2. 尝试用王凑对子 (一张普通牌 + 一张王)
  if (jokers.length > 0) {
    for (const card of sorted) {
      if (!isJoker(card)) {
        if (!noSplit || groups[card.value].length === 1) {
          const pair = [card, jokers[0]];
          if (getDGLZType(pair)) return pair;
        }
      }
    }
  }

  return null;
};

// 找最小的三条
const findSmallestTriple = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  noSplit: boolean = false,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const groups = groupByValue(sorted.filter((c) => !isJoker(c)));

  // 1. 优先找真正的三条
  for (const [, cards] of Object.entries(groups).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    if (cards.length === 3 || (!noSplit && cards.length >= 3)) {
      const triple = cards.slice(0, 3);
      if (getDGLZType(triple)) return triple;
    }
  }

  // 2. 尝试用王凑三条
  if (jokers.length > 0) {
    for (const [, cards] of Object.entries(groups).sort(
      ([a], [b]) => Number(a) - Number(b),
    )) {
      // 对子 + 1王
      if (cards.length >= 2 && jokers.length >= 1) {
        const triple = [...cards.slice(0, 2), jokers[0]];
        if (getDGLZType(triple)) return triple;
      }
      // 单张 + 2王
      if (cards.length >= 1 && jokers.length >= 2) {
        const triple = [cards[0], ...jokers.slice(0, 2)];
        if (getDGLZType(triple)) return triple;
      }
    }
  }

  return null;
};

// 找最小的5张组合
const findSmallestFiveCard = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
): Card[] | null => {
  if (sorted.length < 5) return null;

  // 优先级从小到大尝试 (杂顺 < 同花 < 葫芦 < 炸弹 < 同花顺 < 五条)

  // 1. 杂顺
  const straight = findStraight(sorted, getDGLZType);
  if (straight) return straight;

  // 2. 同花
  const flush = findFlush(sorted, getDGLZType);
  if (flush) return flush;

  // 3. 葫芦
  const fullhouse = findFullhouse(sorted, getDGLZType);
  if (fullhouse) return fullhouse;

  // 4. 炸弹 (四带一)
  const bomb = findBomb(sorted, getDGLZType);
  if (bomb) return bomb;

  // 5. 同花顺
  const straightFlush = findStraightFlush(sorted, getDGLZType);
  if (straightFlush) return straightFlush;

  // 6. 五条
  const fiveOfKind = findFiveOfKind(sorted, getDGLZType);
  if (fiveOfKind) return fiveOfKind;

  return null;
};

// 找顺子 (内部使用，不限定花色)
const findStraightInternal = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  suitFilter?: string,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const normalCards = sorted.filter(
    (c) =>
      !isJoker(c) &&
      c.value >= 3 &&
      c.value <= 14 &&
      (!suitFilter || c.suit === suitFilter),
  );

  for (let start = 3; start <= 10; start++) {
    const straightCards: Card[] = [];
    let usedJokers = 0;

    for (let i = 0; i < 5; i++) {
      const targetVal = start + i;
      const card = normalCards.find((c) => c.value === targetVal);
      if (card) {
        straightCards.push(card);
      } else if (usedJokers < jokers.length) {
        straightCards.push(jokers[usedJokers]);
        usedJokers++;
      } else {
        break;
      }
    }

    if (straightCards.length === 5) {
      if (getDGLZType(straightCards)) return straightCards;
    }
  }
  return null;
};

// 找杂顺
const findStraight = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  if (!beatCards || !canBeatFunc)
    return findStraightInternal(sorted, getDGLZType);

  for (let start = 3; start <= 10; start++) {
    const res = findStraightInternal(
      sorted.filter((c) => isJoker(c) || c.value >= start),
      getDGLZType,
    );
    if (res && canBeatFunc(res, beatCards)) return res;
  }
  return null;
};

// 找同花顺
const findStraightFlush = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  const suits = ["♠", "♥", "♣", "♦"];
  let best: Card[] | null = null;

  for (const suit of suits) {
    let res: Card[] | null = null;
    if (beatCards && canBeatFunc) {
      for (let start = 3; start <= 10; start++) {
        const candidate = findStraightInternal(
          sorted.filter(
            (c) => isJoker(c) || (c.value >= start && c.suit === suit),
          ),
          getDGLZType,
          suit,
        );
        if (candidate && canBeatFunc(candidate, beatCards)) {
          res = candidate;
          break;
        }
      }
    } else {
      res = findStraightInternal(sorted, getDGLZType, suit);
    }

    if (res) {
      if (!best || (canBeatFunc && canBeatFunc(best, res))) {
        best = res;
      }
    }
  }
  return best;
};

// 找同花
const findFlush = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const normalCards = sorted.filter((c) => !isJoker(c));
  const suits = ["♠", "♥", "♣", "♦"];
  let best: Card[] | null = null;

  for (const suit of suits) {
    const sameSuit = normalCards
      .filter((c) => c.suit === suit)
      .sort((a, b) => a.value - b.value);
    if (sameSuit.length + jokers.length >= 5) {
      const candidates = [...sameSuit, ...jokers].sort(
        (a, b) => a.value - b.value,
      );
      for (let i = 0; i <= candidates.length - 5; i++) {
        const flush = candidates.slice(i, i + 5);
        if (getDGLZType(flush)) {
          if (!beatCards || !canBeatFunc || canBeatFunc(flush, beatCards)) {
            if (!best || (canBeatFunc && canBeatFunc(best, flush))) {
              best = flush;
              break;
            }
          }
        }
      }
    }
  }
  return best;
};

// 找葫芦
const findFullhouse = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  const entries = Object.entries(
    groupByValue(sorted.filter((c) => !isJoker(c))),
  ).sort(([a], [b]) => Number(a) - Number(b));

  for (const [tVal] of entries) {
    const triple = findSmallestTriple(
      sorted.filter((c) => isJoker(c) || c.value === Number(tVal)),
      getDGLZType,
      false,
    );
    if (triple) {
      const remaining = sorted.filter(
        (c) => !triple.find((t) => t.id === c.id),
      );
      const pair = findSmallestPair(remaining, getDGLZType, false);
      if (pair) {
        const fh = [...triple, ...pair];
        if (getDGLZType(fh)) {
          if (!beatCards || !canBeatFunc || canBeatFunc(fh, beatCards))
            return fh;
        }
      }
    }
  }
  return null;
};

// 找能压过的牌
const findBeatingCards = (
  sorted: Card[],
  last: Card[],
  count: number,
  canBeat: CanBeatFunc,
  isSerious: boolean = false,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const normalCards = sorted.filter((c) => !isJoker(c));
  const groups = groupByValue(normalCards);

  if (count === 1) {
    // 单张：如果情况紧急，找最大的，否则找最小能压过的
    if (isSerious) {
      const desc = [...sorted].sort((a, b) => b.value - a.value);
      for (const card of desc) {
        if (canBeat([card], last)) return [card];
      }
    } else {
      for (const card of sorted) {
        if (canBeat([card], last)) return [card];
      }
    }
  } else if (count === 2) {
    // ...
    // 对子：找最小能压过的
    // 1. 纯对子
    for (const [, cards] of Object.entries(groups).sort(
      ([a], [b]) => Number(a) - Number(b),
    )) {
      if (cards.length >= 2) {
        const pair = cards.slice(0, 2);
        if (canBeat(pair, last)) return pair;
      }
    }
    // 2. 如果有王，尝试 1普通+1王
    if (jokers.length >= 1) {
      for (const card of normalCards) {
        const pair = [card, jokers[0]];
        if (canBeat(pair, last)) return pair;
      }
    }
  } else if (count === 3) {
    // 三条：找最小能压过的
    // 1. 纯三条
    for (const [, cards] of Object.entries(groups).sort(
      ([a], [b]) => Number(a) - Number(b),
    )) {
      if (cards.length >= 3) {
        const triple = cards.slice(0, 3);
        if (canBeat(triple, last)) return triple;
      }
    }
    // 2. 尝试 2普通+1王
    if (jokers.length >= 1) {
      for (const [, cards] of Object.entries(groups).sort(
        ([a], [b]) => Number(a) - Number(b),
      )) {
        if (cards.length >= 2) {
          const triple = [...cards.slice(0, 2), jokers[0]];
          if (canBeat(triple, last)) return triple;
        }
      }
    }
    // 3. 尝试 1普通+2王
    if (jokers.length >= 2) {
      for (const card of normalCards) {
        const triple = [card, ...jokers.slice(0, 2)];
        if (canBeat(triple, last)) return triple;
      }
    }
  }

  return null;
};

// 找能压过的5张牌
const findBeatingFiveCard = (
  sorted: Card[],
  last: Card[],
  getDGLZType: GetDGLZTypeFunc,
  canBeat: CanBeatFunc,
  isSerious: boolean = false,
): Card[] | null => {
  // 按照牌型由小到大排列
  const searchers = [
    () => findStraight(sorted, getDGLZType, last, canBeat),
    () => findFlush(sorted, getDGLZType, last, canBeat),
    () => findFullhouse(sorted, getDGLZType, last, canBeat),
    () => findBomb(sorted, getDGLZType, last, canBeat),
    () => findStraightFlush(sorted, getDGLZType, last, canBeat),
    () => findFiveOfKind(sorted, getDGLZType, last, canBeat),
  ];

  // 如果情况紧急 (isSerious)，则按照从大到小的顺序搜搜，优先扔出重火力压制
  if (isSerious) {
    searchers.reverse();
  }

  for (const searcher of searchers) {
    const candidate = searcher();
    if (candidate && canBeat(candidate, last)) {
      return candidate;
    }
  }

  return null;
};

// 找炸弹（四带一）
const findBomb = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const normalCards = sorted.filter((c) => !isJoker(c));
  const groups = groupByValue(normalCards);

  for (const [, cards] of Object.entries(groups).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    const need = 4 - cards.length;

    if (need <= jokers.length) {
      const 四张 = [...cards, ...jokers.slice(0, Math.max(0, need))];
      const 剩下的牌 = sorted.filter((c) => !四张.find((t) => t.id === c.id));
      if (剩下的牌.length > 0) {
        const bomb = [...四张, 剩下的牌[0]];
        if (getDGLZType(bomb)) {
          if (!beatCards || !canBeatFunc || canBeatFunc(bomb, beatCards))
            return bomb;
        }
      }
    }
  }

  return null;
};

// 找五条
const findFiveOfKind = (
  sorted: Card[],
  getDGLZType: GetDGLZTypeFunc,
  beatCards?: Card[],
  canBeatFunc?: CanBeatFunc,
): Card[] | null => {
  const jokers = sorted.filter(isJoker);
  const normalCards = sorted.filter((c) => !isJoker(c));
  const groups = groupByValue(normalCards);

  for (const [, cards] of Object.entries(groups).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    if (cards.length + jokers.length >= 5) {
      const five = [...cards, ...jokers].slice(0, 5);
      if (getDGLZType(five)) {
        if (!beatCards || !canBeatFunc || canBeatFunc(five, beatCards))
          return five;
      }
    }
  }

  // 5个王
  if (jokers.length >= 5) {
    const five = jokers.slice(0, 5);
    if (!beatCards || !canBeatFunc || canBeatFunc(five, beatCards)) return five;
  }

  return null;
};

// 按点数分组
const groupByValue = (cards: Card[]): { [key: number]: Card[] } => {
  const groups: { [key: number]: Card[] } = {};
  for (const card of cards) {
    if (!groups[card.value]) {
      groups[card.value] = [];
    }
    groups[card.value].push(card);
  }
  return groups;
};
