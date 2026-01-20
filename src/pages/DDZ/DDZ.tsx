import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./DDZ.less";

// 基础接口与常量
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

const suits = ["♠", "♥", "♣", "♦"];
const ranks = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];
const rankValues: { [key: string]: number } = {
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  "2": 15,
  joker: 16,
  JOKER: 17,
};

// 工具函数
const createDeck = (): Card[] => {
  const deck: Card[] = [];
  suits.forEach((suit) =>
    ranks.forEach((rank) => {
      deck.push({ suit, rank, id: `${suit}${rank}`, value: rankValues[rank] });
    })
  );
  deck.push(
    { suit: "🃟", rank: "joker", id: "joker", value: 16 },
    { suit: "🂿", rank: "JOKER", id: "JOKER", value: 17 }
  );
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

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
  // console.log(counts);
  
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
            (v) => (remCounts[v] = (remCounts[v] || 0) + 1)
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

const canBeat = (playedCards: Card[], lastCards: Card[]): boolean => {
  if (!lastCards || lastCards.length === 0) return true;
  const played = getDDZType(playedCards);
  const last = getDDZType(lastCards);
  if (!played || !last) return !last;
  if (played.type === "rocket") return true;
  if (played.type === "bomb") {
    if (last.type === "rocket") return false;
    if (last.type === "bomb") return played.value > last.value;
    return true;
  }
  return (
    played.type === last.type &&
    played.count === last.count &&
    played.value > last.value
  );
};

// AI叫地主逻辑
const evaluateLandlordHand = (hand: Card[]): number => {
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
const findSmartAICards = (
  hand: Card[],
  lastCards: Card[],
  players: Player[],
  myIndex: number
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
    excludeVals: number[] = []
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
    length: number
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
    subType: "plane" | "plane_with_singles" | "plane_with_pairs"
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
      (v) => v > minVal && analysis[v].length === 4
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
          lastType.type as any
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
    (p) => p.id !== me.id && p.isLandlord !== me.isLandlord
  );
  // 只要有任意对手手牌少于 5 张，就开启防守模式
  const isEndgameDefense = opponents.some((p) => p.cards.length < 5);

  const isEarlyGame = !isEndgameDefense && hand.length >= 14;

  // 试探飞机 / 三带（早期尽量不用特别大的三张开局）
  const trios = distinctValues.filter((v) => analysis[v].length === 3);
  const hasSafeTrios =
    trios.length > 0 &&
    (!isEarlyGame || trios[0] <= 11);
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
        "plane_with_singles"
      );
      if (plane) return plane;
      const planeP = findPlane(
        planeStart - 1,
        planeLen * 5,
        "plane_with_pairs"
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

const DouDiZhu: React.FC = () => {
  const navigate = useNavigate();

  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 500);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 原有状态保持不变 
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, name: "玩家1 (你)", cards: [], isLandlord: false, playCount: 0 },
    { id: 1, name: "玩家2", cards: [], isLandlord: false, playCount: 0 },
    { id: 2, name: "玩家3", cards: [], isLandlord: false, playCount: 0 },
  ]);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [lastPlayerId, setLastPlayerId] = useState(-1);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [gamePhase, setGamePhase] = useState<
    "init" | "bidding" | "playing" | "end"
  >("init");
  const [biddingRound, setBiddingRound] = useState(0);
  const [message, setMessage] = useState('点击"开始游戏"发牌');
  const [landlordId, setLandlordId] = useState(-1);
  const [passCount, setPassCount] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [totalTurns, setTotalTurns] = useState(0);

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const myCards = players[0].cards;

  // 滑动选牌相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  // 节流Refs
  const dragEndIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const sortFlipFromRectsRef = useRef<Record<string, DOMRect>>({});
  const sortFlipPendingRef = useRef(false);
  const cardMotionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const captureSortFlipRects = () => {
    const rects: Record<string, DOMRect> = {};
    for (const c of myCards) {
      const el = cardMotionRefs.current[c.id];
      if (!el) continue;
      rects[c.id] = el.getBoundingClientRect();
    }
    sortFlipFromRectsRef.current = rects;
    sortFlipPendingRef.current = true;
  };

  // 游戏流程 
  const startGame = () => {
    const deck = shuffleDeck(createDeck());
    const newPlayers: Player[] = [
      {
        id: 0,
        name: "玩家1 (你)",
        cards: deck.slice(0, 17).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 1,
        name: "玩家2",
        cards: deck.slice(17, 34).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 2,
        name: "玩家3",
        cards: deck.slice(34, 51).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
    ];
    setPlayers(newPlayers);
    setBaseCards(deck.slice(51, 54));
    setLastPlayedCards([]);
    setLastPlayerId(-1);
    setSelectedCards([]);
    setCurrentPlayer(0);
    setGamePhase("bidding");
    setBiddingRound(0);
    setLandlordId(-1);
    setPassCount(0);
    setTotalTurns(0);
    setSortOrder("desc"); // 默认大到小
    setMessage("叫地主阶段！玩家1先选择是否叫地主");
  };

  const callLandlord = (call: boolean) => {
    if (call) {
      const newPlayers = [...players];
      newPlayers[currentPlayer].isLandlord = true;
      newPlayers[currentPlayer].cards = [
        ...newPlayers[currentPlayer].cards,
        ...baseCards,
      ].sort((a, b) => (sortOrder === "asc" ? a.value - b.value : b.value - a.value));
      setPlayers(newPlayers);
      setLandlordId(currentPlayer);
      setGamePhase("playing");
      setMessage(`${newPlayers[currentPlayer].name} 成为地主！`);
    } else {
      const nextPlayer = (currentPlayer + 1) % 3;
      if (biddingRound + 1 >= 3) {
        setTimeout(startGame, 1000);
        return;
      }
      setCurrentPlayer(nextPlayer);
      setBiddingRound(biddingRound + 1);
      setMessage(`轮到${players[nextPlayer].name}叫地主`);
    }
  };

  // 切换手牌牌序
  const toggleSortOrder = () => {
    captureSortFlipRects();
    const newOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(newOrder);

    // 重新排序当前玩家的手牌
    const newPlayers = [...players];
    const myCards = [...newPlayers[0].cards];
    
    if (newOrder === "asc") {
      myCards.sort((a, b) => a.value - b.value);
    } else {
      myCards.sort((a, b) => b.value - a.value);
    }
    
    newPlayers[0] = { ...newPlayers[0], cards: myCards };
    setPlayers(newPlayers);
  };

  useLayoutEffect(() => {
    if (!sortFlipPendingRef.current) return;
    const fromRects = sortFlipFromRectsRef.current;
    sortFlipPendingRef.current = false;

    for (const c of myCards) {
      const el = cardMotionRefs.current[c.id];
      const fromRect = fromRects[c.id];
      if (!el || !fromRect) continue;
      const toRect = el.getBoundingClientRect();
      const dx = fromRect.left - toRect.left;
      const dy = fromRect.top - toRect.top;
      if (dx === 0 && dy === 0) continue;

      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.98)` },
          { transform: "translate(0px, 0px) scale(1)" },
        ],
        {
          duration: 260,
          easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
          fill: "both",
        }
      );
    }
  }, [myCards]);

  // 核心动作封装 
  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
    // const type = getDDZType(cardsToPlay);
    const newPlayers = [...players];
    newPlayers[playerId].cards = newPlayers[playerId].cards.filter(
      (card) => !cardsToPlay.find((c) => c.id === card.id)
    );
    newPlayers[playerId].playCount = (newPlayers[playerId].playCount || 0) + 1;

    setPlayers(newPlayers);
    setLastPlayedCards(cardsToPlay);
    setLastPlayerId(playerId);
    setPassCount(0);
    setSelectedCards([]);
    setTotalTurns((prev) => prev + 1);

    if (newPlayers[playerId].cards.length === 0) {
      setMessage(
        `🎉 ${newPlayers[playerId].isLandlord ? "地主" : "农民"}获胜！`
      );
      setGamePhase("end");
      return;
    }

    const nextPlayer = (playerId + 1) % 3;
    setCurrentPlayer(nextPlayer);
    setMessage(
      `${players[playerId].name} 出牌，轮到${players[nextPlayer].name}`
    );
  };

  const handlePass = (playerId: number) => {
    const newPassCount = passCount + 1;
    setPassCount(newPassCount);
    setTotalTurns((prev) => prev + 1);
    const nextPlayer = (playerId + 1) % 3;
    setCurrentPlayer(nextPlayer);
    if (newPassCount >= 2) {
      setLastPlayedCards([]);
      setPassCount(0);
      setMessage(`${players[nextPlayer].name} 获得出牌权`);
    } else {
      setMessage(`${players[playerId].name} 过牌`);
    }
  };

  // 玩家手动出牌
  const playCards = () => {
    const selected = players[0].cards.filter((card) =>
      selectedCards.includes(card.id)
    );
    if (!getDDZType(selected)) return setMessage("无效牌型");
    if (!canBeat(selected, lastPlayedCards)) return setMessage("压不过上家");
    handlePlay(0, selected);
  };

  //  AI 监听
  useEffect(() => {
    if (gamePhase === "bidding" && currentPlayer !== 0) {
      const timer = setTimeout(() => {
        const hand = players[currentPlayer].cards;
        const score = evaluateLandlordHand(hand);
        let call = false;
        if (score >= 28) {
          call = true;
        } else if (score >= 20) {
          call = Math.random() > 0.4;
        }
        callLandlord(call);
      }, 1200);
      return () => clearTimeout(timer);
    }
    if (gamePhase === "playing" && currentPlayer !== 0) {
      const timer = setTimeout(() => {
        const aiCards = findSmartAICards(
          players[currentPlayer].cards,
          lastPlayedCards,
          players,
          currentPlayer
        );
        if (aiCards) handlePlay(currentPlayer, aiCards);
        else handlePass(currentPlayer);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [gamePhase, currentPlayer, lastPlayedCards]);

  // 处理触摸滑动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || dragStartIndex === null) return;
    
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = target?.closest('.card');
    
    if (cardElement) {
      const indexStr = cardElement.getAttribute('data-index');
      if (indexStr) {
        const index = parseInt(indexStr, 10);
        
        // 使用 requestAnimationFrame 进行节流
        dragEndIndexRef.current = index;
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            setDragEndIndex(dragEndIndexRef.current);
            rafRef.current = null;
          });
        }
      }
    }
  };

  // 全局 pointerup 监听，用于结束滑动
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      // 取消待处理的节流更新
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (isDragging && dragStartIndex !== null && dragEndIndex !== null) {
        // 计算最终选中的范围
        const min = Math.min(dragStartIndex, dragEndIndex);
        const max = Math.max(dragStartIndex, dragEndIndex);

        // 应用选中状态
        const newSelected = new Set(selectedCards);

        for (let i = min; i <= max; i++) {
          if (i >= 0 && i < myCards.length) {
            if (dragMode === "select") {
              newSelected.add(myCards[i].id);
            } else {
              newSelected.delete(myCards[i].id);
            }
          }
        }

        setSelectedCards(Array.from(newSelected));
      }

      // 重置状态
      setIsDragging(false);
      setDragStartIndex(null);
      setDragEndIndex(null);
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [
    isDragging,
    dragStartIndex,
    dragEndIndex,
    dragMode,
    players,
    selectedCards,
  ]);

  // 卡牌渲染
  const renderCard = (
    card: Card,
    isSelectable = false,
    isSelected = false,
    size = "normal",
    index: number = -1
  ) => {
    const isRed =
      card.suit === "♥" || card.suit === "♦" || card.rank === "JOKER";
    const isJoker = card.rank === "joker" || card.rank === "JOKER";

    // 计算滑动过程中的临时选中状态
    let displaySelected = isSelected;
    if (
      isSelectable &&
      isDragging &&
      dragStartIndex !== null &&
      dragEndIndex !== null &&
      index !== -1
    ) {
      const min = Math.min(dragStartIndex, dragEndIndex);
      const max = Math.max(dragStartIndex, dragEndIndex);
      if (index >= min && index <= max) {
        displaySelected = dragMode === "select";
      }
    }

    return (
      <div
        key={card.id}
        onPointerDown={(e) => {
          if (isSelectable && index !== -1) {
            e.preventDefault(); // 防止文本选择
            e.stopPropagation(); // 防止冒泡
            setIsDragging(true);
            setDragStartIndex(index);
            setDragEndIndex(index);
            // 如果当前已经选中，则模式为取消选中，否则为选中
            setDragMode(isSelected ? "deselect" : "select");
          }
        }}
        onPointerEnter={() => {
          if (isSelectable && isDragging && index !== -1) {
            // 使用 requestAnimationFrame 进行节流，避免高频重绘
            dragEndIndexRef.current = index;
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(() => {
                setDragEndIndex(dragEndIndexRef.current);
                rafRef.current = null;
              });
            }
          }
        }}
        
        className={`card ${size} ${isJoker ? "joker-card" : ""} ${
          isRed ? "red" : "black"
        } ${displaySelected ? "selected" : ""} ${
          isSelectable ? "selectable" : ""
        }`}
        style={{ touchAction: "none" }} // 防止触摸滚动
        data-index={index}
      >
        {isJoker ? (
          <>
            <div className="card-top-left">
              <div className="card-rank joker-text">
                J<br />O<br />K<br />E<br />R
              </div>
            </div>
            <div className="joker-main-symbol">{card.suit}</div>
            <div className="card-bottom-right">
              <div className="card-rank joker-text">
                J<br />O<br />K<br />E<br />R
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card-top-left">
              <div className="card-rank">{card.rank}</div>
              <div className="card-suit">{card.suit}</div>
            </div>
            <div className="card-bottom-right">
              <div className="card-rank">{card.rank}</div>
              <div className="card-suit">{card.suit}</div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="game-container-ddz">
      {(gamePhase === "init" || gamePhase === "bidding") && (
        <button className="btn-rules" onClick={() => setShowRules(true)}>
          <span className="icon">📜</span> 规则
        </button>
      )}

      {(gamePhase === "playing" || gamePhase === "end") && (
        <button
          className="btn-rules-icon"
          onClick={() => setShowRules(true)}
          title="游戏规则"
        >
          📜
        </button>
      )}

      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">游戏规则</h2>
            <div className="modal-body">
              <div className="rule-list">
                <div className="rule-title">牌型</div>
                <div className="rule-item">
                  <span className="rule-label">单张</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-1", rank: "A", suit: "♠", value: 14 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">对子</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-2", rank: "8", suit: "♠", value: 8 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-3", rank: "8", suit: "♥", value: 8 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">三张</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-4", rank: "K", suit: "♠", value: 13 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-5", rank: "K", suit: "♥", value: 13 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-6", rank: "K", suit: "♣", value: 13 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">三带一</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-7", rank: "9", suit: "♠", value: 9 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-8", rank: "9", suit: "♥", value: 9 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-9", rank: "9", suit: "♣", value: 9 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-10", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">三带二</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-40", rank: "Q", suit: "♠", value: 12 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-41", rank: "Q", suit: "♥", value: 12 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-42", rank: "Q", suit: "♣", value: 12 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-43", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-44", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">顺子</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-11", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-12", rank: "4", suit: "♥", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-13", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-14", rank: "6", suit: "♦", value: 6 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-15", rank: "7", suit: "♠", value: 7 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">连对</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-16", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-17", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-18", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-19", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-20", rank: "5", suit: "♠", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-21", rank: "5", suit: "♥", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">飞机</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-22", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-23", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-24", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-25", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-26", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-27", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">飞机带单</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-50", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-51", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-52", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-53", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-54", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-55", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-56", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-57", rank: "6", suit: "♣", value: 6 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">飞机带对</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-60", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-61", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-62", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-63", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-64", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-65", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-66", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-67", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-68", rank: "6", suit: "♠", value: 6 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-69", rank: "6", suit: "♥", value: 6 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">炸弹</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-28", rank: "2", suit: "♠", value: 15 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-29", rank: "2", suit: "♥", value: 15 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-30", rank: "2", suit: "♣", value: 15 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-31", rank: "2", suit: "♦", value: 15 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">王炸</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-32", rank: "joker", suit: "🃟", value: 16 },
                      false,
                      false,
                      "mini"
                    )}
                    {renderCard(
                      { id: "-33", rank: "JOKER", suit: "🂿", value: 17 },
                      false,
                      false,
                      "mini"
                    )}
                  </div>
                </div>
              </div>
              <p style={{ marginTop: "1rem" }}>
                <strong>获胜条件：</strong>第一个出完所有手牌的玩家的阵营获胜（地主单独一方，两个农民同阵营）。
              </p>
            </div>
            <button
              className="btn btn-primary close-btn"
              onClick={() => setShowRules(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <div className="game-wrapper">
        {(gamePhase === "init" || gamePhase === "bidding") && (
          <h1 className="game-title">斗地主</h1>
        )}
        <div className="message-box">
          <p className="message-text">{message}</p>
        </div>
        <div className="button-group top-right">
          <button
            onClick={() => navigate("/")}
            className="btn btn-home"
            style={{ marginBottom: gamePhase !== "init" ? "0.5rem" : "0" }}
          >
            返回主页
          </button>
          {gamePhase !== "init" && (
            <button onClick={startGame} className="btn btn-red">
              重新开始
            </button>
          )}
        </div>

        {gamePhase === "init" && (
          <div className="button-group">
            <button onClick={startGame} className="btn btn-blue">
              开始游戏
            </button>
          </div>
        )}

        {gamePhase !== "init" && (
          <div className="base-cards-section">
            <div className="base-cards-panel">
              <h3 className="panel-title">底牌</h3>
              <div className="base-cards-container">
                {landlordId === -1
                  ? [1, 2, 3].map((i) => (
                      <div key={i} className="card-placeholder"></div>
                    ))
                  : baseCards.map((c) => renderCard(c, false, false, "normal"))}
              </div>
            </div>
          </div>
        )}

        <div className="game-area">
          <div className="side-player left">
            {players[1] && (
              <div
                className={`player-info ${
                  currentPlayer === 1 &&
                  (gamePhase === "playing" || gamePhase === "bidding")
                    ? "active"
                    : ""
                } ${players[1].isLandlord ? "landlord" : ""} ${
                  gamePhase === "end" && lastPlayerId === 1 ? "winner" : ""
                }`}
              >
                <h3 className="player-name">{players[1].name}</h3>
                {gamePhase !== "init" && (
                  <>
                    <p className="player-cards-count">
                      剩余: {players[1].cards.length} 张
                    </p>
                    <p className="player-stats">
                      出牌: {players[1].playCount || 0}
                    </p>
                  </>
                )}
                {gamePhase === "end" && players[1].cards.length > 0 && (
                  <div className="remaining-cards">
                    {players[1].cards.map((c) =>
                      renderCard(c, false, false, "mini")
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="center-area">
            <div className="table-area">
              <h3 className="table-title">
                当前牌面{" "}
                {gamePhase !== "init" && (
                  <span className="game-stats-inline">
                    轮次: {Math.floor(totalTurns / 3) + 1}
                  </span>
                )}
              </h3>
              {lastPlayedCards.length > 0 ? (
                <>
                  <p className="table-info">
                    {players[lastPlayerId]?.name} 出的牌
                  </p>
                  <div
                    className={`table-cards ${
                      lastPlayedCards.length <= 5
                        ? "scale-large"
                        : lastPlayedCards.length <= 10
                        ? "scale-medium"
                        : "scale-small"
                    }`}
                  >
                    {lastPlayedCards.map((c) =>
                      renderCard(c, false, false, "normal")
                    )}
                  </div>
                </>
              ) : (
                <p className="table-empty">等待出牌...</p>
              )}
            </div>
          </div>
          <div className="side-player right">
            {players[2] && (
              <div
                className={`player-info ${
                  currentPlayer === 2 &&
                  (gamePhase === "playing" || gamePhase === "bidding")
                    ? "active"
                    : ""
                } ${players[2].isLandlord ? "landlord" : ""} ${
                  gamePhase === "end" && lastPlayerId === 2 ? "winner" : ""
                }`}
              >
                <h3 className="player-name">{players[2].name}</h3>
                {gamePhase !== "init" && (
                  <>
                    <p className="player-cards-count">
                      剩余: {players[2].cards.length} 张
                    </p>
                    <p className="player-stats">
                      出牌: {players[2].playCount || 0}
                    </p>
                  </>
                )}
                {gamePhase === "end" && players[2].cards.length > 0 && (
                  <div className="remaining-cards">
                    {players[2].cards.map((c) =>
                      renderCard(c, false, false, "mini")
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {(gamePhase === "playing" ||
          gamePhase === "bidding" ||
          gamePhase === "end") && (
          <div
            className={`player-hand ${
              players[0].isLandlord ? "landlord" : ""
            } ${currentPlayer === 0 ? "active" : ""} ${
              gamePhase === "end" && lastPlayerId === 0 ? "winner" : ""
            }`}
            style={{ position: "relative" }}
          >
            <div className="hand-header">
              <div className="hand-controls">
                <button
                  className={`btn btn-sort sort-direction-toggle ${
                    sortOrder === "desc" ? "is-default" : "is-reversed"
                  }`}
                  onClick={toggleSortOrder}
                  title={sortOrder === "asc" ? "当前：小 → 大" : "当前：大 → 小"}
                >
                  <span className="sort-arrow">➜</span>
                </button>
              </div>

              <h3 className="hand-title">
                剩余: {players[0].cards.length} 张
                <span className="player-stats-inline">
                  出牌: {players[0].playCount || 0}
                </span>
              </h3>

              {currentPlayer === 0 && gamePhase === "bidding" && (
                <div className="button-group">
                  <button
                    onClick={() => callLandlord(false)}
                    className="btn btn-pass"
                  >
                    不叫
                  </button>
                  <button
                    onClick={() => callLandlord(true)}
                    className="btn btn-landlord"
                  >
                    叫地主 👑
                  </button>
                </div>
              )}

              {currentPlayer === 0 && gamePhase === "playing" && (
                <div className="button-group">
                  <button
                    onClick={() => handlePass(0)}
                    disabled={lastPlayedCards.length === 0}
                    className="btn btn-pass-card"
                  >
                    过牌
                  </button>
                  <button
                    onClick={playCards}
                    disabled={selectedCards.length === 0}
                    className="btn btn-play"
                  >
                    出牌 ({selectedCards.length})
                  </button>
                </div>
              )}
            </div>

            <div className="hand-cards-scroll-container" onTouchMove={handleTouchMove}>
              {isSmallScreen && myCards.length >= 10 ? (
                <>
                  <div className="hand-cards">
                    {myCards.slice(0, Math.ceil(myCards.length / 2)).map((card, idx) => (
                      <div
                        key={card.id}
                        className="card-motion"
                        ref={(el) => {
                          cardMotionRefs.current[card.id] = el;
                        }}
                      >
                        {renderCard(
                          card,
                          gamePhase !== "end",
                          selectedCards.includes(card.id),
                          "normal",
                          idx
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="hand-cards" style={{ marginTop: "-2rem" }}>
                    {myCards.slice(Math.ceil(myCards.length / 2)).map((card, idx) => (
                      <div
                        key={card.id}
                        className="card-motion"
                        ref={(el) => {
                          cardMotionRefs.current[card.id] = el;
                        }}
                      >
                        {renderCard(
                          card,
                          gamePhase !== "end",
                          selectedCards.includes(card.id),
                          "normal",
                          idx + Math.ceil(myCards.length / 2)
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="hand-cards">
                  {myCards.map((card, idx) => (
                    <div
                      key={card.id}
                      className="card-motion"
                      ref={(el) => {
                        cardMotionRefs.current[card.id] = el;
                      }}
                    >
                      {renderCard(
                        card,
                        gamePhase !== "end",
                        selectedCards.includes(card.id),
                        "normal",
                        idx
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DouDiZhu;
