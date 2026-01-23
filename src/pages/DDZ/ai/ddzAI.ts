/**
 * 斗地主 AI 出牌逻辑
 * 从 DDZ.tsx 提取
 */

interface Card {
  suit: string;
  rank: string;
  id: string;
  value: number;
}

interface CardType {
  type: string;
  value: number;
  count: number;
}

interface Player {
  id: number;
  name: string;
  cards: Card[];
  isLandlord: boolean;
  playCount: number;
}

// 牌型校验
const getDDZType = (cards: Card[]): CardType | null => {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const values = sorted.map((c) => c.value);
  const len = cards.length;

  //王炸
  if (len === 2 && values[0] === 16 && values[1] === 17)
    return { type: "rocket", value: 100, count: 2 };

  const counts: { [key: number]: number } = {};

  values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const freq = Object.entries(counts)
    .map(([v, c]) => ({ val: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  // 炸弹
  if (len === 4 && freq[0].count === 4)
    return { type: "bomb", value: freq[0].val, count: 4 };
  //单张
  if (len === 1) return { type: "single", value: values[0], count: 1 };
  // 对子
  if (len === 2 && values[0] === values[1])
    return { type: "pair", value: values[0], count: 2 };
  // 三张
  if (len === 3 && freq[0].count === 3)
    return { type: "triple", value: freq[0].val, count: 3 };

  if (freq[0].count === 3) {
    // 三带一
    if (len === 4)
      return { type: "triple_single", value: freq[0].val, count: 4 };
    // 三带二
    if (len === 5 && freq[1]?.count === 2)
      return { type: "triple_pair", value: freq[0].val, count: 5 };
  }

  // 顺子
  if (len >= 5 && freq.every((f) => f.count === 1) && values[len - 1] < 15) {
    if (values[len - 1] - values[0] === len - 1)
      return { type: "straight", value: values[len - 1], count: len };
  }

  // 连对
  if (
    len >= 4 &&
    len % 2 === 0 &&
    freq.every((f) => f.count === 2) &&
    values[len - 1] < 15
  ) {
    const pairValues = freq.map((f) => f.val).sort((a, b) => a - b);
    if (
      pairValues[pairValues.length - 1] - pairValues[0] ===
      pairValues.length - 1
    ) {
      return {
        type: "consecutive_pairs",
        value: pairValues[pairValues.length - 1],
        count: len,
      };
    }
  }

  // 飞机
  const trios = freq
    .filter((f) => f.count >= 3)
    .map((f) => f.val)
    .sort((a, b) => a - b);
  if (trios.length >= 2) {
    for (let i = 0; i < trios.length; i++) {
      let consecutiveCount = 1;
      let maxTrioVal = trios[i];
      for (let j = i + 1; j < trios.length; j++) {
        if (trios[j] === trios[j - 1] + 1 && trios[j] < 15) {
          consecutiveCount++;
          maxTrioVal = trios[j];
        } else {
          break;
        }
      }

      if (consecutiveCount >= 2) {
        // 纯飞机
        if (len === consecutiveCount * 3) {
          return { type: "plane", value: maxTrioVal, count: len };
        }
        // 飞机带单
        if (len === consecutiveCount * 4) {
          return { type: "plane_with_singles", value: maxTrioVal, count: len };
        }
        // 飞机带对
        if (len === consecutiveCount * 5) {
          const planeValues: number[] = [];
          for (let k = 0; k < consecutiveCount; k++)
            planeValues.push(maxTrioVal - k);
          const remainingValues = [...values];
          for (const pv of planeValues) {
            for (let k = 0; k < 3; k++) {
              const idx = remainingValues.indexOf(pv);
              if (idx > -1) remainingValues.splice(idx, 1);
            }
          }
          const remCounts: { [key: number]: number } = {};
          remainingValues.forEach(
            (v) => (remCounts[v] = (remCounts[v] || 0) + 1),
          );
          const allPairs = Object.values(remCounts).every((c) => c % 2 === 0);
          if (allPairs) {
            return { type: "plane_with_pairs", value: maxTrioVal, count: len };
          }
        }
      }
    }
  }

  return null;
};

// AI叫地主逻辑 - 评估手牌强度
export const evaluateLandlordHand = (hand: Card[]): number => {
  const counts: { [key: number]: number } = {};
  hand.forEach((c) => {
    counts[c.value] = (counts[c.value] || 0) + 1;
  });
  const distinct = Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b);
  let score = 0;
  hand.forEach((card) => {
    if (card.value >= 17) {
      score += 7;
    } else if (card.value === 16) {
      score += 6;
    } else if (card.value === 15) {
      score += 4;
    } else if (card.value === 14) {
      score += 3;
    } else if (card.value === 13) {
      score += 2.5;
    } else if (card.value === 12) {
      score += 2;
    } else if (card.value >= 10) {
      score += 1;
    } else {
      score += 0.3;
    }
  });
  distinct.forEach((v) => {
    const count = counts[v];
    if (count === 4) {
      score += 8;
    } else if (count === 3) {
      score += v >= 11 ? 4 : 2;
    } else if (count === 2) {
      if (v >= 11) score += 1.5;
      else if (v >= 8) score += 0.8;
    }
  });
  const smallSingles = distinct.filter((v) => v <= 8 && counts[v] === 1).length;
  score -= smallSingles * 0.4;
  return score;
};

// AI 出牌逻辑
export const playsByAI = (
  hand: Card[],
  lastCards: Card[],
  players: Player[],
  myIndex: number,
): Card[] | null => {
  const lastType = lastCards.length > 0 ? getDDZType(lastCards) : null;
  const opponentCount = players[0].cards.length; // 兼容旧逻辑变量名

  // 1. 整理手牌
  const analysis: { [key: number]: Card[] } = {};
  hand.forEach((c) => {
    if (!analysis[c.value]) analysis[c.value] = [];
    analysis[c.value].push(c);
  });
  // 排序后的独立点数
  const distinctValues = Object.keys(analysis)
    .map(Number)
    .sort((a, b) => a - b);

  // 辅助函数：查找大于 minVal 的 count 张牌
  const findHigher = (
    minVal: number,
    count: number,
    excludeVals: number[] = [],
  ): Card[] | null => {
    for (const v of distinctValues) {
      if (
        v > minVal &&
        !excludeVals.includes(v) &&
        analysis[v].length >= count
      ) {
        // 尽量拆分，但如果是炸弹且不需要炸弹，则尽量不拆 (简单策略：尽量保留炸弹)
        if (analysis[v].length === 4 && count < 4) continue;
        // 如果是火箭，不拆
        if (v === 16 || v === 17) {
          const hasRocket =
            analysis[16]?.length === 1 && analysis[17]?.length === 1;
          if (hasRocket && count === 1) continue;
        }
        return analysis[v].slice(0, count);
      }
    }
    // 如果没有合适的非炸弹/火箭牌，再考虑拆炸弹
    for (const v of distinctValues) {
      if (
        v > minVal &&
        !excludeVals.includes(v) &&
        analysis[v].length >= count
      ) {
        return analysis[v].slice(0, count);
      }
    }
    return null;
  };

  // 辅助函数：查找顺子
  const findStraight = (minVal: number, length: number): Card[] | null => {
    // 顺子不能包含 2 (15) 和 王 (16, 17)
    for (let i = 0; i < distinctValues.length; i++) {
      const startVal = distinctValues[i];
      if (startVal <= minVal) continue;
      if (startVal + length - 1 >= 15) break; // 超过 A 了

      let seq: Card[] = [];
      let valid = true;
      for (let j = 0; j < length; j++) {
        const target = startVal + j;
        if (!analysis[target] || analysis[target].length === 0) {
          valid = false;
          break;
        }
        seq.push(analysis[target][0]);
      }
      if (valid) return seq;
    }
    return null;
  };

  // 辅助函数：查找连对
  const findConsecutivePairs = (
    minVal: number,
    length: number,
  ): Card[] | null => {
    const pairCount = length / 2;
    for (let i = 0; i < distinctValues.length; i++) {
      const startVal = distinctValues[i];
      if (startVal <= minVal) continue;
      if (startVal + pairCount - 1 >= 15) break;

      let seq: Card[] = [];
      let valid = true;
      for (let j = 0; j < pairCount; j++) {
        const target = startVal + j;
        if (!analysis[target] || analysis[target].length < 2) {
          valid = false;
          break;
        }
        seq.push(...analysis[target].slice(0, 2));
      }
      if (valid) return seq;
    }
    return null;
  };

  // 辅助函数：查找飞机
  const findPlane = (
    minVal: number,
    length: number,
    subType: "plane" | "plane_with_singles" | "plane_with_pairs",
  ): Card[] | null => {
    let numTrios = 0;
    if (subType === "plane") numTrios = length / 3;
    if (subType === "plane_with_singles") numTrios = length / 4;
    if (subType === "plane_with_pairs") numTrios = length / 5;

    for (let i = 0; i < distinctValues.length; i++) {
      const startVal = distinctValues[i];
      if (startVal <= minVal) continue;
      if (startVal + numTrios - 1 >= 15) break;

      // 检查是否有连续的三张
      let trios: Card[] = [];
      let trioVals: number[] = [];
      let validTrios = true;
      for (let j = 0; j < numTrios; j++) {
        const target = startVal + j;
        if (!analysis[target] || analysis[target].length < 3) {
          validTrios = false;
          break;
        }
        trios.push(...analysis[target].slice(0, 3));
        trioVals.push(target);
      }

      if (validTrios) {
        // 找到了主体飞机，现在找翅膀
        if (subType === "plane") return trios;

        if (subType === "plane_with_singles") {
          let wings: Card[] = [];
          for (const v of distinctValues) {
            if (trioVals.includes(v)) continue;
            const countNeeded = numTrios - wings.length;
            const available = analysis[v].length;
            if (available === 4) continue; // 尽量不拆炸弹
            const take = Math.min(countNeeded, available);
            wings.push(...analysis[v].slice(0, take));
            if (wings.length === numTrios) break;
          }
          if (wings.length === numTrios) return [...trios, ...wings];
        }

        if (subType === "plane_with_pairs") {
          let wings: Card[] = [];
          for (const v of distinctValues) {
            if (trioVals.includes(v)) continue;
            if (analysis[v].length >= 2) {
              wings.push(...analysis[v].slice(0, 2));
            }
            if (wings.length === numTrios * 2) break;
          }
          if (wings.length === numTrios * 2) return [...trios, ...wings];
        }
      }
    }
    return null;
  };

  // 查找炸弹
  const findBomb = (minVal: number): Card[] | null => {
    const bombVal = distinctValues.find(
      (v) => v > minVal && analysis[v].length === 4,
    );
    return bombVal ? analysis[bombVal] : null;
  };

  // 查找火箭
  const findRocket = (): Card[] | null => {
    if (
      analysis[16] &&
      analysis[16].length === 1 &&
      analysis[17] &&
      analysis[17].length === 1
    ) {
      return [analysis[16][0], analysis[17][0]];
    }
    return null;
  };

  //  决策逻辑

  // 1. 如果是跟牌 (有 lastType)
  if (lastType) {
    let result: Card[] | null = null;

    switch (lastType.type) {
      case "single": {
        const isEmergency = opponentCount <= 2;
        if (isEmergency) {
          const maxVal = distinctValues[distinctValues.length - 1];
          if (maxVal > lastType.value) {
            result = [analysis[maxVal][0]];
          } else {
            result = null;
          }
        } else {
          result = findHigher(lastType.value, 1);
        }
        break;
      }
      case "pair":
        result = findHigher(lastType.value, 2);
        break;
      case "triple":
        result = findHigher(lastType.value, 3);
        break;
      case "triple_single": {
        const trio = findHigher(lastType.value, 3);
        if (trio) {
          const wing = findHigher(0, 1, [trio[0].value]);
          if (wing) result = [...trio, ...wing];
        }
        break;
      }
      case "triple_pair": {
        const trio = findHigher(lastType.value, 3);
        if (trio) {
          const wing = findHigher(0, 2, [trio[0].value]);
          if (wing) result = [...trio, ...wing];
        }
        break;
      }
      case "straight":
        result = findStraight(lastType.value, lastType.count);
        break;
      case "consecutive_pairs":
        result = findConsecutivePairs(lastType.value, lastType.count);
        break;
      case "plane":
      case "plane_with_singles":
      case "plane_with_pairs":
        result = findPlane(
          lastType.value,
          lastType.count,
          lastType.type as "plane" | "plane_with_singles" | "plane_with_pairs",
        );
        break;
      case "bomb":
        result = findBomb(lastType.value);
        break;
      case "rocket":
        return null;
    }

    if (!result && lastType.type !== "rocket") {
      const shouldUseBombOrRocket = opponentCount <= 3 || hand.length <= 4;
      if (shouldUseBombOrRocket) {
        if (lastType.type !== "bomb") {
          result = findBomb(0);
        }
        if (!result) {
          result = findRocket();
        }
      }
    }

    return result;
  }

  // 2. 如果是主动出牌 (Lead)
  // 检查是否有对手牌量过少（进入残局防守模式）
  const me = players[myIndex];
  // 敌对阵营：如果我是地主，对手是农民；如果我是农民，对手是地主
  const opponents = players.filter(
    (p) => p.id !== me.id && p.isLandlord !== me.isLandlord,
  );
  // 只要有任意对手手牌少于 5 张，就开启防守模式
  const isEndgameDefense = opponents.some((p) => p.cards.length < 5);

  const isEarlyGame = !isEndgameDefense && hand.length >= 14;

  // 试探飞机 / 三带（早期尽量不用特别大的三张开局）
  const trios = distinctValues.filter((v) => analysis[v].length === 3);
  const hasSafeTrios = trios.length > 0 && (!isEarlyGame || trios[0] <= 11);
  if (hasSafeTrios) {
    let planeStart = -1;
    let planeLen = 0;
    for (let i = 0; i < trios.length; i++) {
      if (i > 0 && trios[i] === trios[i - 1] + 1 && trios[i] < 15) {
        if (planeLen === 0) {
          planeStart = trios[i - 1];
          planeLen = 2;
        } else {
          planeLen++;
        }
      } else {
        if (planeLen >= 2) break;
        planeLen = 0;
      }
    }
    if (planeLen >= 2) {
      const plane = findPlane(
        planeStart - 1,
        planeLen * 4,
        "plane_with_singles",
      );
      if (plane) return plane;
      const planeP = findPlane(
        planeStart - 1,
        planeLen * 5,
        "plane_with_pairs",
      );
      if (planeP) return planeP;
      const planePure = findPlane(planeStart - 1, planeLen * 3, "plane");
      if (planePure) return planePure;
    }

    // 三带
    const tVal = trios[0];
    const t = analysis[tVal];
    const wing1 = findHigher(0, 1, [tVal]);
    if (wing1) return [...t, ...wing1];
    const wing2 = findHigher(0, 2, [tVal]);
    if (wing2) return [...t, ...wing2];
    return t;
  }

  // 试探连对
  const pairs = distinctValues.filter((v) => analysis[v].length >= 2 && v < 15);
  let cpStart = -1;
  let cpLen = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (i > 0 && pairs[i] === pairs[i - 1] + 1) {
      if (cpLen === 0) {
        cpStart = pairs[i - 1];
        cpLen = 2;
      } else {
        cpLen++;
      }
    } else {
      if (cpLen >= 3) break;
      cpLen = 0;
    }
  }
  if (cpLen >= 3) {
    return findConsecutivePairs(cpStart - 1, cpLen * 2);
  }

  // 试探顺子
  const singles = distinctValues.filter((v) => v < 15);
  let strStart = -1;
  let strLen = 0;
  for (let i = 0; i < singles.length; i++) {
    if (i > 0 && singles[i] === singles[i - 1] + 1) {
      if (strLen === 0) {
        strStart = singles[i - 1];
        strLen = 2;
      } else {
        strLen++;
      }
    } else {
      if (strLen >= 5) break;
      strLen = 0;
    }
  }
  if (strLen >= 5) {
    return findStraight(strStart - 1, strLen);
  }

  // 出对子
  const firstPairVal = distinctValues.find((v) => analysis[v].length === 2);
  if (firstPairVal !== undefined) {
    return analysis[firstPairVal];
  }

  // 出单张
  // 策略：如果是残局防守模式，且手牌中只剩下单张（或没有其他牌型可出），先出最大的单张；否则出最小的单张
  const singleVals = distinctValues.filter((v) => analysis[v].length === 1);
  if (singleVals.length > 0) {
    if (isEndgameDefense) {
      // 检查是否只剩下单张（即没有对子、三张等其他牌型）
      // 这里简单判断：如果所有手牌都是单张（distinctValues长度 == hand.length），或者只剩单张和炸弹/火箭但不想拆
      // 更精确的逻辑：如果前面所有的组合判断（飞机、连对、顺子、对子）都失败了，才走到这里。
      // 所以只要判断是否还有其他非单张的牌（比如炸弹、三张但没带出去的）
      const hasOtherTypes = distinctValues.some((v) => analysis[v].length >= 2);

      if (!hasOtherTypes) {
        // 确实没别的牌型了，只能出单张 -> 从大到小出，拦截对手
        const maxSingleVal = singleVals[singleVals.length - 1];
        return analysis[maxSingleVal];
      }
    }
    // 默认情况或还有其他牌型配合时，保留大牌，出最小单张
    return analysis[singleVals[0]];
  }

  const anyVal = distinctValues.find((v) => analysis[v].length < 4);
  if (anyVal) return [analysis[anyVal][0]];

  return analysis[distinctValues[0]];
};
