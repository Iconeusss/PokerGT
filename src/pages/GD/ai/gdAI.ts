/**
 * 掼蛋 AI 出牌逻辑
 * 从 GD.tsx 提取
 */

interface Card {
  suit: string;
  rank: string;
  id: string;
  value: number;
  isWild?: boolean;
}

interface CardType {
  type: string;
  value: number;
  count: number;
  baseValue?: number;
}

interface Player {
  id: number;
  name: string;
  cards: Card[];
  playCount: number;
  teamId: number;
  teamScore: number;
}

interface AIContext {
  currentPlayer: number;
  lastPlayerId: number;
  players: Player[];
  passCount: number;
  consecutivePlayCounts: Record<number, number>;
  levelCardValue: number;
}

// 炸弹信息
interface BombInfo {
  cards: Card[];
  value: number;
  baseValue: number;
  isValuable: boolean;
}

// 牌型候选
interface PlayCandidate {
  type: string;
  cards: Card[];
  priority: number;
  maxValue: number;
}

// 从 GD.tsx 引入的牌型判断函数（需要外部提供）
type GetGDTypeFunc = (cards: Card[], levelCard: number) => CardType | null;
type CanBeatFunc = (
  playedCards: Card[],
  lastCards: Card[],
  levelCard: number,
) => boolean;
type IsBombFunc = (type: string) => boolean;

/**
 * 掼蛋 AI 出牌逻辑
 * @param hand 当前手牌
 * @param last 上家出的牌
 * @param ctx AI 上下文（包含游戏状态）
 * @param getGDType 牌型判断函数
 * @param canBeat 是否能压过函数
 * @param isBomb 是否为炸弹函数
 */
export const playsByAI = (
  hand: Card[],
  last: Card[],
  ctx: AIContext,
  getGDType: GetGDTypeFunc,
  canBeat: CanBeatFunc,
  isBomb: IsBombFunc,
): Card[] | null => {
  const {
    currentPlayer,
    lastPlayerId,
    players,
    passCount,
    consecutivePlayCounts,
    levelCardValue,
  } = ctx;

  if (hand.length === 0) return null;

  // 1. 分析手牌结构
  const wildcards = hand.filter((c) => c.isWild);
  const normal = hand.filter((c) => !c.isWild);
  const groups: Record<number, Card[]> = {};
  normal.forEach((c) => {
    groups[c.value] = groups[c.value] || [];
    groups[c.value].push(c);
  });
  const sortedValues = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);

  // 辅助：查找指定数量的牌（支持逢人配）
  const findCards = (
    val: number,
    count: number,
    wildsToUse: Card[],
  ): Card[] | null => {
    const current = groups[val] || [];
    const needed = count - current.length;
    if (needed <= 0) return current.slice(0, count);
    if (wildsToUse.length >= needed) {
      return [...current, ...wildsToUse.slice(0, needed)];
    }
    return null;
  };

  // ========== 炸弹分析 ==========
  const analyzeBombs = (): BombInfo[] => {
    const bombs: BombInfo[] = [];

    // 普通炸弹（4张及以上）
    for (const v of sortedValues) {
      const count = groups[v].length;
      if (count >= 4) {
        const bombCards = groups[v].slice(0, count);
        const bombValue =
          (count === 4
            ? 4000
            : count === 5
              ? 5000
              : count === 6
                ? 6000
                : count === 7
                  ? 7000
                  : 8000) + v;
        const isValuable = v >= 14 || v === levelCardValue;
        bombs.push({
          cards: bombCards,
          value: bombValue,
          baseValue: v,
          isValuable,
        });
      } else if (count >= 1 && count + wildcards.length >= 4) {
        const neededWilds = 4 - count;
        if (wildcards.length >= neededWilds) {
          const bombCards = [...groups[v], ...wildcards.slice(0, neededWilds)];
          const isValuable = v >= 14 || v === levelCardValue;
          bombs.push({
            cards: bombCards,
            value: 4000 + v,
            baseValue: v,
            isValuable,
          });
        }
      }
    }

    // 四王炸
    const jokers = hand.filter((c) => c.rank === "joker" || c.rank === "JOKER");
    if (jokers.length === 4) {
      bombs.push({
        cards: jokers,
        value: 20000,
        baseValue: 17,
        isValuable: true,
      });
    }

    return bombs;
  };

  const allBombs = analyzeBombs();
  const smallBombs = allBombs.filter((b) => !b.isValuable && b.baseValue < 10);
  const valuableBombs = allBombs.filter((b) => b.isValuable);

  // ========== 0. 残局最优解 (Endgame Solver) ==========
  if (last.length === 0 && hand.length <= 6) {
    if (getGDType(hand, levelCardValue)) return hand;

    for (const bomb of allBombs) {
      const bombCardIds = new Set(bomb.cards.map((c) => c.id));
      const restCards = hand.filter((c) => !bombCardIds.has(c.id));

      if (restCards.length > 0 && getGDType(restCards, levelCardValue)) {
        return restCards;
      }
    }
  }

  // ========== 牌型候选分析 ==========
  const candidates: PlayCandidate[] = [];

  // A. 顺子分析
  const findAllStraights = (): { cards: Card[]; maxValue: number }[] => {
    const straights: { cards: Card[]; maxValue: number }[] = [];
    for (let start = 3; start <= 10; start++) {
      const wilds = [...wildcards];
      let cards: Card[] = [];
      let possible = true;
      for (let i = 0; i < 5; i++) {
        const val = start + i;
        if (val === levelCardValue) {
          possible = false;
          break;
        }
        const found = findCards(val, 1, wilds);
        if (found) {
          cards = [...cards, ...found];
          found.forEach((c) => {
            if (c.isWild) {
              const idx = wilds.indexOf(c);
              if (idx > -1) wilds.splice(idx, 1);
            }
          });
        } else {
          possible = false;
          break;
        }
      }
      if (possible) straights.push({ cards, maxValue: start + 4 });
    }
    return straights;
  };

  // B. 钢板分析
  const findAllSteelPlates = (): { cards: Card[]; maxValue: number }[] => {
    const plates: { cards: Card[]; maxValue: number }[] = [];
    for (let i = 0; i < sortedValues.length - 1; i++) {
      const v1 = sortedValues[i];
      const v2 = sortedValues[i + 1];
      if (v2 === v1 + 1 && v1 !== levelCardValue && v2 !== levelCardValue) {
        const w = [...wildcards];
        const c1 = findCards(v1, 3, w);
        if (c1) {
          const wRemaining = w.filter((x) => !c1.includes(x));
          const c2 = findCards(v2, 3, wRemaining);
          if (c2) plates.push({ cards: [...c1, ...c2], maxValue: v2 });
        }
      }
    }
    return plates;
  };

  // C. 连对分析
  const findAllConsecutivePairs = (): {
    cards: Card[];
    maxValue: number;
  }[] => {
    const pairs: { cards: Card[]; maxValue: number }[] = [];
    for (let i = 0; i < sortedValues.length - 2; i++) {
      const v1 = sortedValues[i];
      if (sortedValues[i + 1] === v1 + 1 && sortedValues[i + 2] === v1 + 2) {
        const v2 = v1 + 1,
          v3 = v1 + 2;
        if ([v1, v2, v3].includes(levelCardValue)) continue;
        const w = [...wildcards];
        const c1 = findCards(v1, 2, w);
        if (c1) {
          const w2 = w.filter((x) => !c1.includes(x));
          const c2 = findCards(v2, 2, w2);
          if (c2) {
            const w3 = w2.filter((x) => !c2.includes(x));
            const c3 = findCards(v3, 2, w3);
            if (c3) pairs.push({ cards: [...c1, ...c2, ...c3], maxValue: v3 });
          }
        }
      }
    }
    return pairs;
  };

  // D. 三带二分析
  const findAllFullHouses = (): { cards: Card[]; tripleValue: number }[] => {
    const houses: { cards: Card[]; tripleValue: number }[] = [];
    for (const v of sortedValues) {
      const w = [...wildcards];
      const triple = findCards(v, 3, w);
      if (triple) {
        const w2 = w.filter((x) => !triple.includes(x));
        for (const pVal of sortedValues) {
          if (pVal === v) continue;
          const pair = findCards(pVal, 2, w2);
          if (pair) {
            houses.push({ cards: [...triple, ...pair], tripleValue: v });
            break;
          }
        }
      }
    }
    return houses;
  };

  // E. 三张分析
  const findAllTriples = (): { cards: Card[]; value: number }[] => {
    const triples: { cards: Card[]; value: number }[] = [];
    for (const v of sortedValues) {
      const tri = findCards(v, 3, [...wildcards]);
      if (tri) triples.push({ cards: tri, value: v });
    }
    return triples;
  };

  // F. 对子分析
  const findAllPairs = (): { cards: Card[]; value: number }[] => {
    const pairs: { cards: Card[]; value: number }[] = [];
    for (const v of sortedValues) {
      if ((v === 16 || v === 17) && (groups[v]?.length || 0) < 2) continue;
      const pair = findCards(v, 2, [...wildcards]);
      if (pair) pairs.push({ cards: pair, value: v });
    }
    return pairs;
  };

  // 2. 主动出牌逻辑 (Leading) - 动态优先级
  if (last.length === 0) {
    const straights = findAllStraights();
    const steelPlates = findAllSteelPlates();
    const consecutivePairs = findAllConsecutivePairs();
    const fullHouses = findAllFullHouses();
    const triples = findAllTriples();
    const pairs = findAllPairs();

    // 顺子
    straights.forEach((s) => {
      let priority = straights.length * 2;
      if (s.maxValue >= 14) priority += 3;
      candidates.push({
        type: "straight",
        cards: s.cards,
        priority,
        maxValue: s.maxValue,
      });
    });

    // 钢板
    steelPlates.forEach((s) => {
      let priority = steelPlates.length * 2 + 1;
      if (s.maxValue >= 14) priority += 3;
      candidates.push({
        type: "steel_plate",
        cards: s.cards,
        priority,
        maxValue: s.maxValue,
      });
    });

    // 连对
    consecutivePairs.forEach((s) => {
      let priority = consecutivePairs.length * 2;
      if (s.maxValue >= 14) priority += 3;
      candidates.push({
        type: "consecutive_pairs",
        cards: s.cards,
        priority,
        maxValue: s.maxValue,
      });
    });

    // 三带二
    fullHouses.forEach((s) => {
      let priority = fullHouses.length * 2;
      if (s.tripleValue === 15) {
        priority -= 3;
      } else if (s.tripleValue >= 14) {
        priority -= 2;
      }
      candidates.push({
        type: "fullhouse",
        cards: s.cards,
        priority,
        maxValue: s.tripleValue,
      });
    });

    // 三张
    triples.forEach((s) => {
      let priority = triples.length;
      if (s.value === 15) {
        priority -= 3;
      } else if (s.value >= 14) {
        priority -= 2;
      }
      candidates.push({
        type: "triple",
        cards: s.cards,
        priority,
        maxValue: s.value,
      });
    });

    // 对子
    pairs.forEach((s) => {
      let priority = pairs.length * 0.5;
      if (s.value === 15) {
        priority -= 3;
      } else if (s.value >= 14) {
        priority -= 2;
      }
      candidates.push({
        type: "pair",
        cards: s.cards,
        priority,
        maxValue: s.value,
      });
    });

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.maxValue - b.maxValue;
    });

    if (candidates.length > 0) {
      return candidates[0].cards;
    }

    const isAllSingles = sortedValues.every((v) => groups[v].length === 1);
    if (isAllSingles && hand.length <= 10) {
      const highestValue = sortedValues[sortedValues.length - 1];
      if (highestValue !== undefined) {
        return [groups[highestValue][0]];
      }
    }

    return [
      sortedValues.length > 0 ? groups[sortedValues[0]][0] : wildcards[0],
    ];
  }

  // 3. 跟牌逻辑
  const lastType = getGDType(last, levelCardValue);
  if (!lastType) return null;

  const isTeammate =
    lastPlayerId !== -1 && (currentPlayer + 2) % 4 === lastPlayerId;

  // 团队合作
  if (isTeammate) {
    const teammateId = lastPlayerId;
    const teammateHandCount = players[teammateId].cards.length;
    const isWeakPlay =
      lastType.value < 10 &&
      (lastType.type === "single" || lastType.type === "pair");
    const teammateStruggling = teammateHandCount > 15;

    if (isWeakPlay && teammateStruggling) {
      if (lastType.type === "single") {
        for (const v of sortedValues) {
          if (v >= 12 && v > lastType.value && groups[v].length === 1) {
            return [groups[v][0]];
          }
        }
      }
      if (lastType.type === "pair") {
        for (const v of sortedValues) {
          if (v >= 12 && v > lastType.value && groups[v].length === 2) {
            return groups[v].slice(0, 2);
          }
        }
      }
    }
    return null;
  }

  const opponentId = lastPlayerId;
  const opponentConsecutivePlays =
    opponentId >= 0 ? consecutivePlayCounts[opponentId] || 0 : 0;
  const shouldIntercept = opponentConsecutivePlays >= 2;

  const opponentCards =
    opponentId >= 0 ? players[opponentId]?.cards.length || 27 : 27;
  const needTeammateProtection = opponentCards < 10;
  const isSecondTeammate = passCount >= 1 && !isTeammate;
  const aggressiveMode = needTeammateProtection && isSecondTeammate;

  const isEarlyGame = hand.length > 15;
  const shouldConserveWildcards = isEarlyGame && !needTeammateProtection;

  const comboIds = new Set<string>();
  [
    ...findAllStraights(),
    ...findAllSteelPlates(),
    ...findAllConsecutivePairs(),
  ].forEach((s) => s.cards.forEach((c) => comboIds.add(c.id)));

  // A. 单张
  if (lastType.type === "single") {
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 1) {
        const free = groups[v].find((c) => !comboIds.has(c.id));
        if (free) {
          if (isTeammate && v >= 14) continue;
          return [free];
        }
      }
    }
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 2) {
        const free = groups[v].find((c) => !comboIds.has(c.id));
        if (free) {
          if (isTeammate && v >= 14) continue;
          return [free];
        }
      }
    }
    for (const v of sortedValues) {
      if (
        v > lastType.value &&
        (groups[v].length === 1 ||
          groups[v].length === 2 ||
          groups[v].length === 3)
      ) {
        if (isTeammate && v >= 14) continue;
        const isEndGame = hand.length <= 10;
        if (v >= 14 && lastType.value < 10 && !aggressiveMode && !isEndGame) {
          continue;
        }
        return [groups[v][0]];
      }
    }

    if (wildcards.length > 0 && 15 > lastType.value) {
      if (!isTeammate && (!shouldConserveWildcards || aggressiveMode)) {
        return [wildcards[0]];
      }
    }
  }

  // B. 对子
  if (lastType.type === "pair") {
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 2) {
        const free = groups[v].filter((c) => !comboIds.has(c.id));
        if (free.length >= 2) {
          if (isTeammate && v >= 14) continue;
          return free.slice(0, 2);
        }
      }
    }
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 3) {
        const free = groups[v].filter((c) => !comboIds.has(c.id));
        if (free.length >= 2) {
          if (isTeammate && v >= 14) continue;
          return free.slice(0, 2);
        }
      }
    }
    for (const v of sortedValues) {
      if (
        v > lastType.value &&
        (groups[v].length === 2 || groups[v].length === 3)
      ) {
        if (isTeammate && v >= 14) continue;
        return groups[v].slice(0, 2);
      }
    }
  }

  // C. 三张
  if (lastType.type === "triple") {
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 3) {
        const free = groups[v].filter((c) => !comboIds.has(c.id));
        if (free.length >= 3) {
          if (isTeammate && v >= 14) continue;
          return free.slice(0, 3);
        }
      }
    }
    for (const v of sortedValues) {
      if (v > lastType.value && groups[v].length === 3) {
        if (isTeammate && v >= 14) continue;
        return groups[v].slice(0, 3);
      }
    }
  }

  // D. 三带二
  if (lastType.type === "fullhouse") {
    for (const v of sortedValues) {
      if (v > lastType.value) {
        if (isTeammate && v >= 14) continue;
        const w = [...wildcards];
        const triple = findCards(v, 3, w);
        if (triple) {
          const w2 = w.filter((x) => !triple.includes(x));
          for (const pVal of sortedValues) {
            if (pVal === v) continue;
            const pair = findCards(pVal, 2, w2);
            if (pair) return [...triple, ...pair];
          }
        }
      }
    }
  }

  // E. 顺子
  if (lastType.type === "straight") {
    const len = 5;
    const minStart = (lastType.baseValue ?? 0) - len + 2;
    for (let start = minStart; start <= 10; start++) {
      if (start + len - 1 <= (lastType.baseValue ?? 0)) continue;
      if (isTeammate && start + len - 1 >= 14) continue;
      const w = [...wildcards];
      let cards: Card[] = [];
      let possible = true;
      for (let i = 0; i < len; i++) {
        const val = start + i;
        if (val === levelCardValue) {
          possible = false;
          break;
        }
        const found = findCards(val, 1, w);
        if (found) {
          cards = [...cards, ...found];
          found.forEach((c) => {
            if (c.isWild) w.splice(w.indexOf(c), 1);
          });
        } else {
          possible = false;
          break;
        }
      }
      if (possible) return cards;
    }
  }

  // F. 连对
  if (lastType.type === "consecutive_pairs") {
    for (let i = 0; i < sortedValues.length - 2; i++) {
      const v1 = sortedValues[i];
      if (v1 + 2 > lastType.value) {
        if (isTeammate && v1 + 2 >= 14) continue;
        const v2 = v1 + 1,
          v3 = v1 + 2;
        if ([v1, v2, v3].includes(levelCardValue)) continue;
        const w = [...wildcards];
        const c1 = findCards(v1, 2, w);
        if (c1) {
          const w2 = w.filter((x) => !c1.includes(x));
          const c2 = findCards(v2, 2, w2);
          if (c2) {
            const w3 = w2.filter((x) => !c2.includes(x));
            const c3 = findCards(v3, 2, w3);
            if (c3) return [...c1, ...c2, ...c3];
          }
        }
      }
    }
  }

  // G. 炸弹策略
  if (allBombs.length > 0) {
    const validBombs = allBombs.filter((b) =>
      canBeat(b.cards, last, levelCardValue),
    );

    if (validBombs.length > 0) {
      if (isTeammate) return null;

      if (isBomb(lastType.type)) {
        validBombs.sort((a, b) => a.value - b.value);
        return validBombs[0].cards;
      }

      if (aggressiveMode) {
        const validSmallBombs = smallBombs.filter((b) =>
          canBeat(b.cards, last, levelCardValue),
        );
        if (validSmallBombs.length > 0) {
          validSmallBombs.sort((a, b) => a.value - b.value);
          return validSmallBombs[0].cards;
        }
        const validValuableBombs = valuableBombs.filter((b) =>
          canBeat(b.cards, last, levelCardValue),
        );
        if (validValuableBombs.length > 0) {
          validValuableBombs.sort((a, b) => a.value - b.value);
          return validValuableBombs[0].cards;
        }
      }

      if (shouldIntercept && smallBombs.length > 0) {
        const validSmallBombs = smallBombs.filter((b) =>
          canBeat(b.cards, last, levelCardValue),
        );
        if (validSmallBombs.length > 0) {
          validSmallBombs.sort((a, b) => a.value - b.value);
          return validSmallBombs[0].cards;
        }
      }

      const isEndGame = hand.length <= 10;
      const isUrgent = lastType.value >= 14;

      if (isEndGame || isUrgent) {
        const validSmallBombs = smallBombs.filter((b) =>
          canBeat(b.cards, last, levelCardValue),
        );
        if (validSmallBombs.length > 0) {
          validSmallBombs.sort((a, b) => a.value - b.value);
          return validSmallBombs[0].cards;
        }

        if (hand.length <= 5 || lastType.value >= 14) {
          const validValuableBombs = valuableBombs.filter((b) =>
            canBeat(b.cards, last, levelCardValue),
          );
          if (validValuableBombs.length > 0) {
            validValuableBombs.sort((a, b) => a.value - b.value);
            return validValuableBombs[0].cards;
          }
        }
      }
    }
  }

  return null;
};
