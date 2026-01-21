import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./GD.less";

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

interface TributeInfo {
  payerId: number;
  receiverId: number;
  payCard?: Card;
  returnCard?: Card;
  isAntiTribute: boolean; // 双大王
  status: "pending_pay" | "pending_return" | "done" | "anti_tribute_success";
}

type SortMode = "suit" | "value";
type SortDirection = "default" | "reversed";

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
  "2": 2,
  joker: 16,
  JOKER: 17,
};

// 工具函数
const createDeck = (suffix: string): Card[] => {
  const deck: Card[] = [];
  suits.forEach((suit) =>
    ranks.forEach((rank) => {
      deck.push({
        suit,
        rank,
        id: `${suit}${rank}-${suffix}`,
        value: rankValues[rank],
      });
    }),
  );
  deck.push(
    { suit: "🃟", rank: "joker", id: `joker-${suffix}`, value: 16 },
    { suit: "🂿", rank: "JOKER", id: `JOKER-${suffix}`, value: 17 },
  );
  return deck;
};

const createDoubleDeck = (): Card[] => {
  return [...createDeck("a"), ...createDeck("b")];
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

const getGDType = (
  cards: Card[],
  levelCard: number = rankValues["2"],
): CardType | null => {
  if (cards.length === 0) return null;

  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const values = sorted.map((c) => c.value);
  const len = cards.length;

  // 统计每个牌值的数量（逢人配单独统计）
  const wildcardCount = cards.filter((c) => c.isWild).length;
  const normalCards = cards.filter((c) => !c.isWild);

  const counts: { [key: number]: number } = {};
  normalCards.forEach((c) => {
    counts[c.value] = (counts[c.value] || 0) + 1;
  });

  const freq = Object.entries(counts)
    .map(([v, c]) => ({ val: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  const allSameSuit =
    normalCards.length === 0 ||
    normalCards.every((c) => c.suit === normalCards[0].suit);

  // four_jokers > bomb_l > straight_flush > bomb_m
  //  同花顺
  if (len === 5 && allSameSuit) {
    const straightValues = checkStraight(normalCards, wildcardCount, levelCard);
    if (straightValues) {
      return {
        type: "straight_flush",
        value: 5500 + straightValues.maxValue,
        count: 5,
        baseValue: straightValues.maxValue,
      };
    }
  }

  // 四王炸
  const jokers = cards.filter((c) => c.rank === "joker" || c.rank === "JOKER");
  if (len === 4 && jokers.length === 4) {
    return { type: "four_jokers", value: 20000, count: 4 };
  }

  // 大炸弹
  if (len >= 6 && len <= 8) {
    const maxFreq = freq[0]?.count || 0;
    if (maxFreq + wildcardCount === len) {
      const bombValue = 6000 + (len - 6) * 1000 + freq[0].val;
      return { type: `bomb_${len}`, value: bombValue, count: len };
    }
  }

  // 小炸弹
  if (len >= 4 && len <= 5) {
    const maxFreq = freq[0]?.count || 0;
    if (maxFreq + wildcardCount === len) {
      const bombValue = (len === 5 ? 5000 : 4000) + freq[0].val;
      return { type: `bomb_${len}`, value: bombValue, count: len };
    }
  }

  // 三张
  if (len === 3) {
    const maxFreq = freq[0]?.count || 0;
    if (maxFreq + wildcardCount === 3) {
      return { type: "triple", value: freq[0].val, count: 3 };
    }
  }

  // 对子
  if (len === 2) {
    if (freq[0]?.count === 2 || (freq[0]?.count === 1 && wildcardCount === 1)) {
      const pairValue = freq[0]?.val || values[0];
      // 王对，但逢人配不能配王
      if ((pairValue === 16 || pairValue === 17) && wildcardCount > 0) {
        return null;
      }
      return { type: "pair", value: pairValue, count: 2 };
    }
  }

  // 单张
  if (len === 1) {
    return { type: "single", value: values[0], count: 1 };
  }

  if (len === 5) {
    // 葫芦（三带二）
    if (freq.length === 2) {
      const canMakeFullHouse =
        (freq[0].count === 3 && freq[1].count === 2) ||
        (freq[0].count === 3 && wildcardCount >= 2) ||
        (freq[0].count === 2 && freq[1].count === 2 && wildcardCount >= 1) ||
        (freq[0].count === 2 && freq[1].count === 1 && wildcardCount >= 2);

      if (canMakeFullHouse) {
        return { type: "fullhouse", value: freq[0].val, count: 5 };
      }
    }
    // 顺子
    const straightValues = checkStraight(normalCards, wildcardCount, levelCard);
    if (straightValues && !allSameSuit) {
      return {
        type: "straight",
        value: straightValues.maxValue,
        count: 5,
        baseValue: straightValues.maxValue,
      };
    }
  }

  if (len === 6) {
    // 连对
    const pairResult = checkConsecutivePairs(
      normalCards,
      wildcardCount,
      3,
      levelCard,
    );
    if (pairResult) {
      return {
        type: "consecutive_pairs",
        value: pairResult.maxValue,
        count: 6,
      };
    }
    // 钢板
    const tripleResult = checkConsecutiveTriples(
      normalCards,
      wildcardCount,
      2,
      levelCard,
    );
    if (tripleResult) {
      return {
        type: "steel_plate",
        value: tripleResult.maxValue,
        count: 6,
      };
    }
  }

  return null;
};

// 辅助函数：检查顺子（支持逢人配）
const checkStraight = (
  normalCards: Card[],
  wildcardCount: number,
  levelCard: number,
): { maxValue: number } | null => {
  if (normalCards.length + wildcardCount < 5) return null;

  const normalValues = normalCards.map((c) => {
    // 如果是级牌且非逢人配（逢人配已被剔除），取原值
    if (c.value === levelCard) {
      return rankValues[c.rank];
    }
    return c.value;
  });
  const totalLen = normalCards.length + wildcardCount;

  // 特殊检查 A-2-3-4-5 (只在5张顺子时有效)
  if (totalLen === 5) {
    const a2345 = [14, 2, 3, 4, 5];
    let needed = 0;
    for (const val of a2345) {
      if (!normalValues.includes(val)) {
        needed++;
      }
    }
    if (needed <= wildcardCount) {
      // A2345 算作 5 结尾的顺子（值最小）
      return { maxValue: 5 };
    }
  }

  // 常规顺子 从 2 开始尝试（支持 2-3-4-5-6）
  for (let start = 2; start <= 14 - totalLen + 1; start++) {
    let needed = 0;
    let maxVal = start + totalLen - 1;

    for (let i = 0; i < totalLen; i++) {
      const targetValue = start + i;
      if (!normalValues.includes(targetValue)) {
        needed++;
      }
    }

    if (needed <= wildcardCount) {
      return { maxValue: maxVal };
    }
  }

  return null;
};

// 辅助函数：检查是否能用逢人配组成指定数量的某个牌值
const canMakeCount = (
  value: number,
  targetCount: number,
  counts: { [key: number]: number },
  wildcardCount: number,
): number => {
  const have = counts[value] || 0;
  const needed = targetCount - have;
  return needed <= wildcardCount ? needed : -1;
};

// 辅助函数：检查连续的重复牌型（连对、三顺等）
const checkConsecutivePattern = (
  normalCards: Card[],
  wildcardCount: number,
  patternCount: number, // 需要几组
  repeatCount: number, // 每组重复几次（2=对子，3=三张）
  levelCard: number,
): { maxValue: number } | null => {
  const values = normalCards.map((c) => {
    if (c.value === levelCard) {
      return rankValues[c.rank];
    }
    return c.value;
  });
  const counts: { [key: number]: number } = {};
  values.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });

  // 尝试找从start开始的连续牌型
  for (let start = 2; start <= 14 - patternCount + 1; start++) {
    let totalNeeded = 0;
    let valid = true;

    // 检查每个位置是否能凑够
    for (let i = 0; i < patternCount; i++) {
      const val = start + i;
      if (val === levelCard) {
        valid = false;
        break;
      }

      const needed = canMakeCount(
        val,
        repeatCount,
        counts,
        wildcardCount - totalNeeded,
      );
      if (needed === -1) {
        valid = false;
        break;
      }
      totalNeeded += needed;
    }

    if (valid && totalNeeded <= wildcardCount) {
      return { maxValue: start + patternCount - 1 };
    }
  }

  return null;
};

// 辅助函数：检查连对（调用通用函数）
const checkConsecutivePairs = (
  normalCards: Card[],
  wildcardCount: number,
  pairCount: number,
  levelCard: number,
): { maxValue: number } | null => {
  return checkConsecutivePattern(
    normalCards,
    wildcardCount,
    pairCount,
    2,
    levelCard,
  );
};

// 辅助函数：检查三顺/钢板（调用通用函数）
const checkConsecutiveTriples = (
  normalCards: Card[],
  wildcardCount: number,
  tripleCount: number,
  levelCard: number,
): { maxValue: number } | null => {
  return checkConsecutivePattern(
    normalCards,
    wildcardCount,
    tripleCount,
    3,
    levelCard,
  );
};

const canBeat = (
  playedCards: Card[],
  lastCards: Card[],
  levelCard: number,
): boolean => {
  if (!lastCards || lastCards.length === 0) {
    const played = getGDType(playedCards, levelCard);
    return played !== null;
  }
  const played = getGDType(playedCards, levelCard);
  const last = getGDType(lastCards, levelCard);
  if (!played) return false;
  if (!last) return true;

  const playedIsBomb = isBomb(played.type);
  const lastIsBomb = isBomb(last.type);
  if (playedIsBomb) {
    if (!lastIsBomb) return true;
    return played.value > last.value;
  }
  if (lastIsBomb) return false;
  return (
    played.type === last.type &&
    played.count === last.count &&
    played.value > last.value
  );
};

const isBomb = (type: string): boolean => {
  const bombTypes = [
    "straight_flush",
    "four_jokers",
    "bomb_8",
    "bomb_7",
    "bomb_6",
    "bomb_5",
    "bomb_4",
  ];
  return bombTypes.includes(type);
};

const levelSequence = [
  "2",
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
] as const;
type LevelRank = (typeof levelSequence)[number];

const bumpLevelRank = (levelRank: LevelRank, delta: number): LevelRank => {
  const idx = levelSequence.indexOf(levelRank);
  const nextIdx = (idx + delta) % levelSequence.length;
  return levelSequence[nextIdx];
};

const processCardsForRound = (cards: Card[], levelRank: LevelRank): Card[] => {
  return cards.map((c) => {
    let value = c.value;
    let isWild = false;

    if (c.rank === levelRank) {
      value = 15; // 极牌15 A14 小王16
      if (c.suit === "♥") {
        isWild = true; // 只有红桃级牌是逢人配
      }
    }

    return {
      ...c,
      value,
      isWild,
    };
  });
};

const getCNTypeName = (type: string): string => {
  if (type === "single") return "单张";
  if (type === "pair") return "对子";
  if (type === "triple") return "三张";
  if (type === "fullhouse") return "三带二";
  if (type === "straight") return "顺子";
  if (type === "consecutive_pairs") return "连对";
  if (type === "steel_plate") return "钢板";
  if (type === "straight_flush") return "同花顺";
  if (type === "four_jokers") return "四王炸";
  if (type.startsWith("bomb_")) {
    const count = type.split("_")[1];
    return `${count}张炸弹`;
  }
  return type;
};

const GuanDan: React.FC = () => {
  const navigate = useNavigate();

  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 500);
  const [winningTeamId, setWinningTeamId] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [players, setPlayers] = useState<Player[]>([
    {
      id: 0,
      name: "玩家1 (你)",
      cards: [],
      playCount: 0,
      teamId: 0,
      teamScore: 0,
    },
    { id: 1, name: "玩家2", cards: [], playCount: 0, teamId: 1, teamScore: 0 },
    { id: 2, name: "玩家3", cards: [], playCount: 0, teamId: 0, teamScore: 0 },
    { id: 3, name: "玩家4", cards: [], playCount: 0, teamId: 1, teamScore: 0 },
  ]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [lastPlayerId, setLastPlayerId] = useState(-1);
  const [gamePhase, setGamePhase] = useState<
    "init" | "playing" | "end" | "tribute"
  >("init");
  const [tributeInfos, setTributeInfos] = useState<TributeInfo[]>([]);
  const [message, setMessage] = useState('点击"开始游戏"发牌');
  const [passCount, setPassCount] = useState(0);
  // 玩家连续出牌次数
  const [consecutivePlayCounts, setConsecutivePlayCounts] = useState<
    Record<number, number>
  >({ 0: 0, 1: 0, 2: 0, 3: 0 });
  // 玩家当前出牌动作状态（出牌或过牌）
  const [playerActions, setPlayerActions] = useState<
    Record<number, { type: "play" | "pass"; cards?: Card[] }>
  >({});

  const [showRules, setShowRules] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [scoreHistory, setScoreHistory] = useState<
    { round: number; teamLevels: Record<number, LevelRank> }[]
  >([{ round: 1, teamLevels: { 0: "2", 1: "2" } }]);
  const [roundIndex, setRoundIndex] = useState(1);
  const [finishedOrder, setFinishedOrder] = useState<number[]>([]);
  const [roundLeaderId, setRoundLeaderId] = useState<number>(0);

  const myCards = players[0].cards;
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const [sortMode, setSortMode] = useState<SortMode>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("default");

  const [levelRank, setLevelRank] = useState<LevelRank>("2");
  const [teamLevels, setTeamLevels] = useState<Record<number, LevelRank>>({
    0: "2",
    1: "2",
  });
  const levelCardValue = 15;

  // 辅助函数：获取最大的非极牌
  const getMaxTributeCard = (cards: Card[], lvlRank: string): Card | null => {
    // 排除级牌
    const candidates = cards.filter((c) => c.rank !== lvlRank);
    if (candidates.length === 0) return null; // 理论上不太可能
    // 降序排列
    candidates.sort((a, b) => b.value - a.value);
    return candidates[0];
  };

  // 进贡效果
  useEffect(() => {
    if (gamePhase !== "tribute") return;

    // 找到所有待进贡的
    const pendingPayTributes = tributeInfos.filter(
      (t) => t.status === "pending_pay",
    );
    // 找到第一个待还贡的
    const pendingReturnTribute = tributeInfos.find(
      (t) => t.status === "pending_return",
    );

    // 全部完成检查
    if (pendingPayTributes.length === 0 && !pendingReturnTribute) {
      if (
        tributeInfos.length > 0 &&
        tributeInfos.every(
          (t) => t.status === "done" || t.status === "anti_tribute_success",
        )
      ) {
        // 切换到游戏阶段
        const timer = setTimeout(() => {
          setGamePhase("playing");
          setMessage("进贡结束，游戏开始");

          // 决定谁先出牌
          // 规则：进贡完成后，贡最大牌的玩家先出
          // 双贡时比较两张贡牌
          const doneTributes = tributeInfos.filter((t) => t.status === "done");
          if (doneTributes.length > 0) {
            let starterId = doneTributes[0].receiverId; // 默认值

            // 找到贡牌最大的
            let maxVal = -1;
            let maxPayerId = -1;

            doneTributes.forEach((t) => {
              if (t.payCard && t.payCard.value > maxVal) {
                maxVal = t.payCard.value;
                maxPayerId = t.payerId;
              }
            });

            if (maxPayerId !== -1) {
              starterId = maxPayerId;
            }

            setCurrentPlayer(starterId);
          } else {
            // 如果全部抗贡，startRound已设置好先出玩家，这里不需要改变
          }
        }, 5000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // 优先处理进贡（双贡时AI同时处理）
    if (pendingPayTributes.length > 0) {
      // 分离AI进贡和玩家进贡
      const aiPayTributes = pendingPayTributes.filter((t) => t.payerId !== 0);
      const humanPayTribute = pendingPayTributes.find((t) => t.payerId === 0);

      // 检查是否有单个玩家有双大王（自动抗贡）
      const checkSinglePlayerDoubleJoker = () => {
        for (const tribute of pendingPayTributes) {
          const p = players[tribute.payerId];
          const jokerCount = p.cards.filter((c) => c.rank === "JOKER").length;
          if (jokerCount >= 2) {
            return {
              playerId: tribute.payerId,
              jokers: p.cards.filter((c) => c.rank === "JOKER").slice(0, 2),
            };
          }
        }
        return null;
      };

      const singlePlayerDoubleJoker = checkSinglePlayerDoubleJoker();
      if (singlePlayerDoubleJoker) {
        // 单个玩家有双大王，自动抗贡
        const timer = setTimeout(() => {
          const { playerId, jokers } = singlePlayerDoubleJoker;
          setMessage(
            `抗贡成功！玩家${playerId + 1} 出示双大王：${jokers.map((j) => j.suit).join(" ")}`,
          );
          setTributeInfos((prev) =>
            prev.map((t) => ({
              ...t,
              isAntiTribute: true,
              status: "anti_tribute_success",
            })),
          );
          // 5秒后开始下一轮
          setTimeout(() => {
            setGamePhase("playing");
            setMessage("抗贡成功，游戏开始");
            // 抗贡成功时，进贡方先出
            setCurrentPlayer(singlePlayerDoubleJoker.playerId);
          }, 5000);
        }, 1000);
        return () => clearTimeout(timer);
      }

      // 如果有AI需要进贡，先同时处理所有AI
      if (aiPayTributes.length > 0) {
        const timer = setTimeout(() => {
          const newPlayers = [...players];
          const payCards: { tribute: TributeInfo; card: Card }[] = [];

          aiPayTributes.forEach((tribute) => {
            const p = newPlayers[tribute.payerId];
            const payCard = getMaxTributeCard(p.cards, levelRank);
            if (payCard) {
              payCards.push({ tribute, card: payCard });
              // 从手牌中移除
              const playerIndex = newPlayers.findIndex(
                (pl) => pl.id === tribute.payerId,
              );
              if (playerIndex !== -1) {
                newPlayers[playerIndex] = {
                  ...newPlayers[playerIndex],
                  cards: newPlayers[playerIndex].cards.filter(
                    (c) => c.id !== payCard.id,
                  ),
                };
              }
            }
          });

          // 检查是否凑齐双大王抗贡
          const allPaidCards = [
            ...tributeInfos.filter((t) => t.payCard).map((t) => t.payCard!),
            ...payCards.map((p) => p.card),
          ];
          const jokerCards = allPaidCards.filter((c) => c.rank === "JOKER");

          if (jokerCards.length >= 2) {
            // 抗贡成功！
            const jokerSources = payCards.filter(
              (p) => p.card.rank === "JOKER",
            );
            const existingJokerSources = tributeInfos.filter(
              (t) => t.payCard?.rank === "JOKER",
            );

            setPlayers(newPlayers);
            setMessage(
              `抗贡成功！${[...existingJokerSources.map((t) => `玩家${t.payerId + 1}`), ...jokerSources.map((p) => `玩家${p.tribute.payerId + 1}`)].join("、")} 出示大王`,
            );
            setTributeInfos((prev) =>
              prev.map((t) => {
                const payInfo = payCards.find((p) => p.tribute === t);
                if (payInfo) {
                  return {
                    ...t,
                    payCard: payInfo.card,
                    isAntiTribute: true,
                    status: "anti_tribute_success",
                  };
                }
                if (t.payCard) {
                  return {
                    ...t,
                    isAntiTribute: true,
                    status: "anti_tribute_success",
                  };
                }
                return {
                  ...t,
                  isAntiTribute: true,
                  status: "anti_tribute_success",
                };
              }),
            );
            // 5秒后开始下一轮
            setTimeout(() => {
              setGamePhase("playing");
              setMessage("抗贡成功，游戏开始");
              // 找到贡大王的玩家先出
              const firstJokerPayer =
                jokerSources[0]?.tribute.payerId ??
                existingJokerSources[0]?.payerId ??
                0;
              setCurrentPlayer(firstJokerPayer);
            }, 5000);
            return;
          }

          // 更新玩家手牌
          setPlayers(newPlayers);

          // 更新AI进贡状态
          setTributeInfos((prev) =>
            prev.map((t) => {
              const payInfo = payCards.find((p) => p.tribute === t);
              if (payInfo) {
                return {
                  ...t,
                  payCard: payInfo.card,
                  status: "pending_return",
                };
              }
              return t;
            }),
          );

          if (payCards.length > 1) {
            setMessage(
              `进贡完成：${payCards.map((p) => `玩家${p.tribute.payerId + 1} 进贡 ${p.card.suit}${p.card.rank}`).join("，")}`,
            );
          } else if (payCards.length === 1) {
            setMessage(
              `玩家${payCards[0].tribute.payerId + 1} 进贡了 ${payCards[0].card.suit}${payCards[0].card.rank}`,
            );
          }
        }, 1000);
        return () => clearTimeout(timer);
      }

      // 如果还有玩家需要进贡，等待玩家操作
      if (humanPayTribute) {
        setCurrentPlayer(0);
        // 玩家需要手动点击确认进贡按钮
      }
      return;
    }

    // 处理还贡（保持顺序执行）
    if (pendingReturnTribute) {
      const { receiverId } = pendingReturnTribute;
      const isReceiverAI = receiverId !== 0;

      setCurrentPlayer(receiverId);

      if (isReceiverAI) {
        const timer = setTimeout(() => {
          const p = players[receiverId];
          // AI 还贡最小的 <= 10 的非极牌
          const validCards = p.cards.filter((c) => c.rank !== levelRank);
          validCards.sort((a, b) => a.value - b.value);

          let returnCard = validCards.find((c) => c.value <= 10);
          if (!returnCard) {
            returnCard = validCards[0]; // 兜底用最小的
          }

          if (returnCard) {
            handleTributeMove(pendingReturnTribute, returnCard, "return");
          }
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [gamePhase, tributeInfos, players, levelRank]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

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

  const createPlayersForRound = (activeLevel: LevelRank): Player[] => {
    const deck = shuffleDeck(createDoubleDeck());
    const hands: Card[][] = [
      deck.slice(0, 27),
      deck.slice(27, 54),
      deck.slice(54, 81),
      deck.slice(81, 108),
    ].map((cards) =>
      processCardsForRound(cards, activeLevel).sort(
        (a, b) => b.value - a.value,
      ),
    );

    return [
      {
        id: 0,
        name: "玩家1 (你)",
        cards: hands[0],
        playCount: 0,
        teamId: 0,
        teamScore: 0,
      },
      {
        id: 1,
        name: "玩家2",
        cards: hands[1],
        playCount: 0,
        teamId: 1,
        teamScore: 0,
      },
      {
        id: 2,
        name: "玩家3",
        cards: hands[2],
        playCount: 0,
        teamId: 0,
        teamScore: 0,
      },
      {
        id: 3,
        name: "玩家4",
        cards: hands[3],
        playCount: 0,
        teamId: 1,
        teamScore: 0,
      },
    ];
  };

  const getNextActivePlayer = (from: number, order: number[]): number => {
    const finished = new Set(order);
    for (let step = 1; step <= 4; step++) {
      const pid = (from + step) % 4;
      if (!finished.has(pid)) return pid;
    }
    return from;
  };

  const calculateTribute = (prevOrder: number[]): TributeInfo[] => {
    if (prevOrder.length < 4) return [];

    // 团队固定：0&2 vs 1&3
    const isTeamA = (pid: number) => pid === 0 || pid === 2;

    const firstPid = prevOrder[0];
    const secondPid = prevOrder[1];

    const firstTeamA = isTeamA(firstPid);
    const secondTeamA = isTeamA(secondPid);

    let tributes: TributeInfo[] = [];

    if (firstTeamA === secondTeamA) {
      // 双贡 - 不再预判抗贡，在进贡时检测
      const winner1 = prevOrder[0];
      const winner2 = prevOrder[1];
      const loser1 = prevOrder[2]; // 第三
      const loser2 = prevOrder[3]; // 第四

      // 4 -> 1
      tributes.push({
        payerId: loser2,
        receiverId: winner1,
        isAntiTribute: false,
        status: "pending_pay",
      });
      // 3 -> 2
      tributes.push({
        payerId: loser1,
        receiverId: winner2,
        isAntiTribute: false,
        status: "pending_pay",
      });
    } else {
      // 单贡 - 不再预判抗贡，在进贡时检测
      const winner = prevOrder[0];
      const loser = prevOrder[3];

      tributes.push({
        payerId: loser,
        receiverId: winner,
        isAntiTribute: false,
        status: "pending_pay",
      });
    }

    return tributes;
  };

  const startRound = (
    nextRoundIndex: number,
    nextTeamLevels: Record<number, LevelRank>,
    activeLevel: LevelRank,
    startingPlayerId: number,
    prevFinishedOrder: number[] = [],
  ) => {
    const newPlayers = createPlayersForRound(activeLevel);
    setPlayers(newPlayers);
    setSelectedCards([]);
    // 头游的队伍将在下一局首先出牌
    // 规则调整：下一轮由第四名开始先出牌

    setCurrentPlayer(startingPlayerId);
    if (nextRoundIndex === 1) {
      setRoundLeaderId(-1);
    } else {
      setRoundLeaderId(-1); // 确保新一轮开始时没有任何人有红框，直到产生新的头家
    }
    setLastPlayedCards([]);
    setLastPlayerId(-1);
    setPlayerActions({}); // 清除桌面动作
    setPassCount(0);
    setPassCount(0);
    setFinishedOrder([]);
    setSortMode("value");
    setSortDirection("default");
    setRoundIndex(nextRoundIndex);

    setTeamLevels(nextTeamLevels);
    setLevelRank(activeLevel);

    if (nextRoundIndex === 1) {
      setScoreHistory([{ round: 1, teamLevels: nextTeamLevels }]);
    } else {
      setScoreHistory((prev) => {
        if (prev.some((h) => h.round === nextRoundIndex)) return prev;
        return [...prev, { round: nextRoundIndex, teamLevels: nextTeamLevels }];
      });
    }

    // 进贡逻辑
    let nextPhase: "playing" | "tribute" = "playing";
    let nextMessage = `第 ${nextRoundIndex} / 7 轮开始，当前极牌：${activeLevel} (本方:${nextTeamLevels[0]}, 对方:${nextTeamLevels[1]})`;

    if (nextRoundIndex > 1 && prevFinishedOrder.length === 4) {
      const tributes = calculateTribute(prevFinishedOrder);
      if (tributes.length > 0) {
        setTributeInfos(tributes);
        // 不再预判抗贡，进入进贡环节，在进贡时检测双大王
        nextPhase = "tribute";
        nextMessage = "进贡环节：请按规则进贡";
      } else {
        setTributeInfos([]);
      }
    } else {
      setTributeInfos([]);
    }

    setGamePhase(nextPhase);
    setMessage(nextMessage);
  };

  const startMatch = () => {
    startRound(1, { 0: "2", 1: "2" }, "2", 0);
  };

  const toggleSortMode = () => {
    captureSortFlipRects();
    const newMode = sortMode === "value" ? "suit" : "value";
    setSortMode(newMode);
    setSortDirection("default"); // 切换模式时重置为默认方向
    sortCards(newMode, "default");
  };

  const toggleSortDirection = () => {
    captureSortFlipRects();
    const nextDirection = sortDirection === "default" ? "reversed" : "default";
    setSortDirection(nextDirection);
    sortCards(sortMode, nextDirection);
  };

  const sortCards = (mode: SortMode, direction: SortDirection) => {
    const newPlayers = [...players];
    const myCards = [...newPlayers[0].cards];

    if (mode === "value") {
      // 按大小排序
      if (direction === "default") {
        // 降序（大到小）
        myCards.sort((a, b) => b.value - a.value);
      } else {
        // 升序（小到大）
        myCards.sort((a, b) => a.value - b.value);
      }
    } else {
      // 按花色排序
      const getSuitSortValue = (card: Card): number => {
        // 默认：大王 > 小王 > 红桃 > 方块 > 黑桃 > 梅花
        if (direction === "default") {
          if (card.rank === "JOKER") return 0;
          if (card.rank === "joker") return 1;
          if (card.suit === "♥") return 2;
          if (card.suit === "♦") return 3;
          if (card.suit === "♠") return 4;
          if (card.suit === "♣") return 5;
          return 6;
        } else {
          // 反向：梅花 > 黑桃 > 方块 > 红桃 > 小王 > 大王
          if (card.suit === "♣") return 0;
          if (card.suit === "♠") return 1;
          if (card.suit === "♦") return 2;
          if (card.suit === "♥") return 3;
          if (card.rank === "joker") return 4;
          if (card.rank === "JOKER") return 5;
          return 6;
        }
      };

      myCards.sort((a, b) => {
        const suitDiff = getSuitSortValue(a) - getSuitSortValue(b);
        if (suitDiff !== 0) return suitDiff;
        // 同花色内按大小降序
        return b.value - a.value;
      });
    }

    newPlayers[0] = {
      ...newPlayers[0],
      cards: myCards,
    };
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
        },
      );
    }
  }, [myCards]);

  // 处理触摸滑动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || dragStartIndex === null) return;

    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = target?.closest(".card");

    if (cardElement) {
      const indexStr = cardElement.getAttribute("data-index");
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
    myCards,
    selectedCards,
  ]);

  const renderCard = (
    card: Card,
    isSelectable = false,
    isSelected = false,
    size = "normal",
    index: number = -1,
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

  const endRound = (finalOrder: number[]) => {
    const firstTeam = players[finalOrder[0]]?.teamId ?? 0;
    const secondTeam = players[finalOrder[1]]?.teamId ?? 1;
    const thirdTeam = players[finalOrder[2]]?.teamId ?? 0;
    const delta =
      firstTeam === secondTeam ? 3 : firstTeam === thirdTeam ? 2 : 1;

    // 更新获胜队伍的级牌
    const currentTeamLevel = teamLevels[firstTeam];
    const currentLevelIdx = levelSequence.indexOf(currentTeamLevel);
    // 判断是否超过A
    const nextLevelIdxRaw = currentLevelIdx + delta;
    const maxLevelIdx = levelSequence.length - 1; // A 的索引是 length-1

    // 如果超过了A (即 nextLevelIdxRaw > maxLevelIdx)，或者正好打过A?
    // 规则："如果七轮内有一方获胜后极牌超过了A则直接获胜"
    // 这意味着如果当前是A，然后赢了，就超过A。或者如果当前是K，赢了3级，也超过A。

    let isGameOver = false;
    let finalWinningTeam = -1;

    if (nextLevelIdxRaw > maxLevelIdx) {
      // 超过A，直接获胜
      isGameOver = true;
      finalWinningTeam = firstTeam;
    }

    const nextTeamLevel = bumpLevelRank(currentTeamLevel, delta);

    const nextTeamLevels = {
      ...teamLevels,
      [firstTeam]: nextTeamLevel,
    };

    setTeamLevels(nextTeamLevels);

    // 下一把的极牌由获胜方决定
    const winnerTeamId = firstTeam;
    const nextActiveLevel = nextTeamLevels[winnerTeamId];

    // const nextLevel = nextActiveLevel; // 显示用 nextActiveLevel
    const winnerNames = finalOrder.map(
      (pid) => players[pid]?.name ?? `玩家${pid + 1}`,
    );

    let endMsg = `第 ${roundIndex} / 7 轮结束：${winnerNames.join(" → ")}。队伍${firstTeam + 1}升级 + ${delta}，下轮极牌：${nextActiveLevel}`;

    if (isGameOver) {
      setGamePhase("end");
      setWinningTeamId(finalWinningTeam);
      setMessage(
        `游戏结束！队伍${finalWinningTeam + 1} 率先打过A级，获得最终胜利！`,
      );
      return;
    }

    if (roundIndex >= 7) {
      setGamePhase("end");
      // 比较级牌
      const team0LevelIdx = levelSequence.indexOf(nextTeamLevels[0]);
      const team1LevelIdx = levelSequence.indexOf(nextTeamLevels[1]);

      let finalWinner = -1;
      let reason = "";
      if (team0LevelIdx > team1LevelIdx) {
        finalWinner = 0;
        reason = `队伍1级牌更高 (${nextTeamLevels[0]} > ${nextTeamLevels[1]})`;
      } else if (team1LevelIdx > team0LevelIdx) {
        finalWinner = 1;
        reason = `队伍2级牌更高 (${nextTeamLevels[1]} > ${nextTeamLevels[0]})`;
      } else {
        // 平局
        reason = "双方级牌相同";
      }

      if (finalWinner !== -1) {
        setWinningTeamId(finalWinner);
        setMessage(`7轮结束，${reason}，队伍${finalWinner + 1}获胜！`);
      } else {
        setMessage(`7轮结束，${reason}，平局！`);
      }
      return;
    }

    setMessage(endMsg);

    setTimeout(() => {
      // 规则：下一轮由第四名（上游）开始先出牌
      const nextStarter = finalOrder.length >= 4 ? finalOrder[3] : 0;
      startRound(
        roundIndex + 1,
        nextTeamLevels,
        nextActiveLevel,
        nextStarter,
        finalOrder,
      );
    }, 1600);
  };

  const maybeFinishPlayer = (playerId: number, nextPlayers: Player[]) => {
    if (nextPlayers[playerId].cards.length !== 0) return;
    setFinishedOrder((prev) => {
      if (prev.includes(playerId)) return prev;
      const nextOrder = [...prev, playerId];
      if (nextOrder.length >= 3) {
        const remaining = [0, 1, 2, 3].find((pid) => !nextOrder.includes(pid));
        const finalOrder =
          remaining !== undefined ? [...nextOrder, remaining] : nextOrder;
        setTimeout(() => endRound(finalOrder), 250);
        return finalOrder;
      }
      return nextOrder;
    });
  };

  const handleTributeMove = (
    tribute: TributeInfo,
    card: Card,
    type: "pay" | "return",
  ) => {
    setPlayers((prev) => {
      const next = [...prev];
      const actorId = type === "pay" ? tribute.payerId : tribute.receiverId;
      const actorIndex = next.findIndex((p) => p.id === actorId);
      if (actorIndex === -1) return next;

      // 从出牌者手中移除牌
      next[actorIndex] = {
        ...next[actorIndex],
        cards: next[actorIndex].cards.filter((c) => c.id !== card.id),
      };
      return next;
    });

    if (type === "pay") {
      setTributeInfos((prev) =>
        prev.map((t) =>
          t === tribute ? { ...t, payCard: card, status: "pending_return" } : t,
        ),
      );
      setMessage(`玩家${tribute.payerId + 1} 进贡了 ${card.suit}${card.rank}`);
    } else {
      // 还贡完成，执行交换
      setTributeInfos((prev) =>
        prev.map((t) =>
          t === tribute ? { ...t, returnCard: card, status: "done" } : t,
        ),
      );

      // 添加牌到各玩家
      // 贡牌 -> 接收者
      // 还牌 -> 进贡者
      setPlayers((prev) => {
        const next = [...prev];
        const payerIndex = next.findIndex((p) => p.id === tribute.payerId);
        const receiverIndex = next.findIndex(
          (p) => p.id === tribute.receiverId,
        );

        if (payerIndex !== -1 && tribute.payCard) {
          // returnCard is 'card' argument
          next[payerIndex] = {
            ...next[payerIndex],
            cards: [...next[payerIndex].cards, card].sort(
              (a, b) => b.value - a.value,
            ),
          };
        }
        if (receiverIndex !== -1 && tribute.payCard) {
          next[receiverIndex] = {
            ...next[receiverIndex],
            cards: [...next[receiverIndex].cards, tribute.payCard].sort(
              (a, b) => b.value - a.value,
            ),
          };
        }
        return next;
      });

      setMessage(
        `玩家${tribute.receiverId + 1} 还贡了 ${card.suit}${card.rank}`,
      );
    }

    setSelectedCards([]);
  };

  const confirmTribute = () => {
    const activeTribute = tributeInfos.find(
      (t) => t.status === "pending_pay" || t.status === "pending_return",
    );
    if (!activeTribute) return;

    if (activeTribute.status === "pending_pay" && activeTribute.payerId === 0) {
      // 规则：自动进贡最大的非极牌
      const payCard = getMaxTributeCard(players[0].cards, levelRank);
      if (!payCard) {
        setMessage("没有可进贡的牌");
        return;
      }
      handleTributeMove(activeTribute, payCard, "pay");
    } else if (
      activeTribute.status === "pending_return" &&
      activeTribute.receiverId === 0
    ) {
      if (selectedCards.length !== 1) {
        setMessage("请选择一张牌还贡");
        return;
      }
      const cardId = selectedCards[0];
      const card = players[0].cards.find((c) => c.id === cardId);
      if (!card) return;

      // 规则：还贡的牌必须 <= 10 且不是极牌
      if (card.rank === levelRank) {
        setMessage("不能还贡级牌");
        return;
      }
      // 注：在代码中 10=10，J=11，所以 value <= 10 覆盖 2-10
      const hasSmallCards = players[0].cards.some(
        (c) => c.value <= 10 && c.rank !== levelRank,
      );
      if (hasSmallCards && card.value > 10) {
        setMessage("若有2-10的牌，必须还小牌");
        return;
      }

      handleTributeMove(activeTribute, card, "return");
    }
  };

  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
    const playedType = getGDType(cardsToPlay, levelCardValue);
    if (!playedType) return;
    if (!canBeat(cardsToPlay, lastPlayedCards, levelCardValue)) return;

    const nextPlayers = players.map((p) => ({ ...p, cards: [...p.cards] }));
    nextPlayers[playerId].cards = nextPlayers[playerId].cards.filter(
      (c) => !cardsToPlay.some((x) => x.id === c.id),
    );
    nextPlayers[playerId].playCount =
      (nextPlayers[playerId].playCount || 0) + 1;

    // 更新连续出牌计数（用于拦截策略）
    setConsecutivePlayCounts((prev) => {
      const newCounts = { ...prev };
      // 如果是新的出牌权（上家不是自己），重置自己的计数
      if (lastPlayerId !== playerId && lastPlayerId !== -1) {
        newCounts[playerId] = 1;
      } else {
        // 连续出牌，+1
        newCounts[playerId] = (prev[playerId] || 0) + 1;
      }
      return newCounts;
    });

    // 更新玩家动作显示
    setPlayerActions((prev) => {
      // 如果是新的一轮领出（自己是上一个出牌人 or 上家ID是-1），清理桌面其他人的动作
      const isNewRound = lastPlayerId === -1 || lastPlayerId === playerId;
      const newState = isNewRound ? {} : { ...prev };
      newState[playerId] = { type: "play", cards: cardsToPlay };
      return newState;
    });

    setPlayers(nextPlayers);
    setLastPlayedCards(cardsToPlay);
    setLastPlayerId(playerId);
    setPassCount(0);
    setSelectedCards([]);

    maybeFinishPlayer(playerId, nextPlayers);

    const effectiveFinishedOrder =
      nextPlayers[playerId].cards.length === 0 &&
      !finishedOrder.includes(playerId)
        ? [...finishedOrder, playerId]
        : finishedOrder;
    const nextPid = getNextActivePlayer(playerId, effectiveFinishedOrder);
    setCurrentPlayer(nextPid);
    setMessage(
      `${players[playerId]?.name} 出牌：${getCNTypeName(playedType.type)}`,
    );
  };

  const handlePass = (playerId: number) => {
    if (lastPlayedCards.length === 0) return;

    const nextPid = getNextActivePlayer(playerId, finishedOrder);
    const nextPassCount = passCount + 1;

    if (nextPassCount >= 3 || nextPid === lastPlayerId) {
      setLastPlayedCards([]);
      setPassCount(0);

      // 决定谁下一个出牌
      let nextLead: number;

      // 如果最后出牌的玩家已经出完了，接风
      if (lastPlayerId !== -1 && finishedOrder.includes(lastPlayerId)) {
        // 掼蛋接风规则：
        // 1. 优先由对家接风（如果对家未出完）
        // 2. 如果对家也出完了，则由下家接风（这种情况其实已经是双上，只剩最后一家了）
        const teammateId = (lastPlayerId + 2) % 4;
        if (!finishedOrder.includes(teammateId)) {
          nextLead = teammateId;
          setMessage(`上家出完，队友 ${players[nextLead]?.name} 接风`);
        } else {
          // 对家也没了，找下家
          nextLead = getNextActivePlayer(lastPlayerId, finishedOrder);
          setMessage(`上家出完，下家 ${players[nextLead]?.name} 接风`);
        }
      } else {
        // 正常情况：最后出牌的人还在，归他出牌
        // 或者异常情况兜底
        const leadOrigin = lastPlayerId >= 0 ? lastPlayerId : playerId;
        nextLead = getNextActivePlayer(leadOrigin - 1, finishedOrder);
        setMessage(`${players[nextLead]?.name} 获得出牌权`);
      }

      setCurrentPlayer(nextLead);
      return;
    }

    setPassCount(nextPassCount);
    setCurrentPlayer(nextPid);
    setMessage(`${players[playerId]?.name} 过牌`);

    // 记录过牌动作
    setPlayerActions((prev) => ({
      ...prev,
      [playerId]: { type: "pass" },
    }));
  };

  const playCards = () => {
    if (currentPlayer !== 0 || gamePhase !== "playing") return;
    const selected = myCards.filter((c) => selectedCards.includes(c.id));
    if (selected.length === 0) return;
    if (!getGDType(selected, levelCardValue)) return setMessage("无效牌型");
    if (!canBeat(selected, lastPlayedCards, levelCardValue))
      return setMessage("压不过上家");
    handlePlay(0, selected);
  };

  const playsByAI = (hand: Card[], last: Card[]): Card[] | null => {
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
    interface BombInfo {
      cards: Card[];
      value: number;
      baseValue: number; // 炸弹的点数（不含炸弹类型权重）
      isValuable: boolean; // A炸/级牌炸/四王炸
    }

    const analyzeBombs = (): BombInfo[] => {
      const bombs: BombInfo[] = [];

      // 普通炸弹（4张及以上）
      for (const v of sortedValues) {
        const count = groups[v].length;
        if (count >= 4) {
          // 纯炸弹（不用配）
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
          const isValuable = v >= 14 || v === levelCardValue; // A及以上或级牌
          bombs.push({
            cards: bombCards,
            value: bombValue,
            baseValue: v,
            isValuable,
          });
        } else if (count >= 1 && count + wildcards.length >= 4) {
          // 需要配的4炸
          const neededWilds = 4 - count;
          if (wildcards.length >= neededWilds) {
            const bombCards = [
              ...groups[v],
              ...wildcards.slice(0, neededWilds),
            ];
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
      const jokers = hand.filter(
        (c) => c.rank === "joker" || c.rank === "JOKER",
      );
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
    const smallBombs = allBombs.filter(
      (b) => !b.isValuable && b.baseValue < 10,
    );
    const valuableBombs = allBombs.filter((b) => b.isValuable);

    // ========== 0. 残局最优解 (Endgame Solver) ==========
    if (last.length === 0 && hand.length <= 6) {
      // 1. 尝试一次出完
      if (getGDType(hand, levelCardValue)) return hand;

      // 2. 尝试 "控制牌 + 任意牌" 组合 (Control + Rest)
      // 如果我有炸弹，且除去炸弹后的牌能一次出完，则先出剩下的牌（保留炸弹兜底）
      for (const bomb of allBombs) {
        // 排除炸弹使用的牌
        const bombCardIds = new Set(bomb.cards.map((c) => c.id));
        const restCards = hand.filter((c) => !bombCardIds.has(c.id));

        // 如果剩余牌是合法牌型
        if (restCards.length > 0 && getGDType(restCards, levelCardValue)) {
          // 策略：先出 Rest，保留 Bomb 拿回牌权
          return restCards;
        }
      }
    }

    // ========== 牌型候选分析 ==========
    interface PlayCandidate {
      type: string;
      cards: Card[];
      priority: number; // 优先分数（越高越优先）
      maxValue: number;
    }

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
              if (c3)
                pairs.push({ cards: [...c1, ...c2, ...c3], maxValue: v3 });
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
        // 规则：逢人配不能配王
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

      // 计算优先级：数量多 + 大牌加分
      // 顺子
      straights.forEach((s) => {
        let priority = straights.length * 2; // 数量越多优先级越高
        if (s.maxValue >= 14) priority += 3; // 大牌加分（更容易回收出牌权）
        candidates.push({
          type: "straight",
          cards: s.cards,
          priority,
          maxValue: s.maxValue,
        });
      });

      // 钢板
      steelPlates.forEach((s) => {
        let priority = steelPlates.length * 2 + 1; // 钢板基础分略高
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
        if (s.tripleValue >= 14) priority += 3;
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
        if (s.value >= 14) priority += 2;
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
        if (s.value >= 14) priority += 2;
        candidates.push({
          type: "pair",
          cards: s.cards,
          priority,
          maxValue: s.value,
        });
      });

      // 按优先级排序，优先出分数高的牌型
      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        // 同优先级时，出小牌（留大牌）
        return a.maxValue - b.maxValue;
      });

      // 返回最优牌型
      if (candidates.length > 0) {
        return candidates[0].cards;
      }

      // 兜底：单张（最小）
      return [
        sortedValues.length > 0 ? groups[sortedValues[0]][0] : wildcards[0],
      ];
    }

    // 3. 跟牌逻辑
    const lastType = getGDType(last, levelCardValue);
    if (!lastType) return null;

    const isTeammate =
      lastPlayerId !== -1 && (currentPlayer + 2) % 4 === lastPlayerId;

    // 团队合作：如果队友目前是最大牌
    if (isTeammate) {
      const teammateId = lastPlayerId;
      const teammateHandCount = players[teammateId].cards.length;
      // 接风逻辑：队友牌多（>15），出的牌小（<10），说明可能在求过渡
      const isWeakPlay =
        lastType.value < 10 &&
        (lastType.type === "single" || lastType.type === "pair");
      const teammateStruggling = teammateHandCount > 15;

      if (isWeakPlay && teammateStruggling) {
        // 尝试用较大的牌接风（> Q）
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

    // 检查对手是否连续出牌（用于拦截判断）
    const opponentId = lastPlayerId;
    const opponentConsecutivePlays =
      opponentId >= 0 ? consecutivePlayCounts[opponentId] || 0 : 0;
    const shouldIntercept = opponentConsecutivePlays >= 2; // 连续出2手以上考虑拦截

    // ===== 新增：队友保护策略 =====
    // 检查对手剩余手牌数量
    const opponentCards =
      opponentId >= 0 ? players[opponentId]?.cards.length || 27 : 27;
    const needTeammateProtection = opponentCards < 10; // 对手手牌少于10张需要积极压制

    // 检查是否是"后位队友"（passCount > 0 说明有人过牌了，可能是队友）
    const isSecondTeammate = passCount >= 1 && !isTeammate;

    // 队友保护模式：对手快出完了，需要积极压制
    const aggressiveMode = needTeammateProtection && isSecondTeammate;

    // ===== 新增：极牌保守策略 =====
    // 前期（手牌多）不轻易用极牌压对手，除非对手快出完
    const isEarlyGame = hand.length > 15;
    const shouldConserveWildcards = isEarlyGame && !needTeammateProtection;

    // 3. 智能拆牌预计算 - 标记所有组合牌
    const comboIds = new Set<string>();
    [
      ...findAllStraights(),
      ...findAllSteelPlates(),
      ...findAllConsecutivePairs(),
    ].forEach((s) => s.cards.forEach((c) => comboIds.add(c.id)));

    // A. 单张 - 优先出散牌，不拆对子/三张/炸弹
    if (lastType.type === "single") {
      // 1. 散牌且Free
      for (const v of sortedValues) {
        if (v > lastType.value && groups[v].length === 1) {
          const free = groups[v].find((c) => !comboIds.has(c.id));
          if (free) {
            if (isTeammate && v >= 14) continue;
            return [free];
          }
        }
      }
      // 2. 拆对子(Free)
      for (const v of sortedValues) {
        if (v > lastType.value && groups[v].length === 2) {
          const free = groups[v].find((c) => !comboIds.has(c.id));
          if (free) {
            if (isTeammate && v >= 14) continue;
            return [free];
          }
        }
      }
      // 3. 兜底：拆任何单/对/三
      for (const v of sortedValues) {
        if (
          v > lastType.value &&
          (groups[v].length === 1 ||
            groups[v].length === 2 ||
            groups[v].length === 3)
        ) {
          if (isTeammate && v >= 14) continue;
          return [groups[v][0]];
        }
      }

      // 极牌单打
      if (wildcards.length > 0 && 15 > lastType.value) {
        if (!isTeammate && (!shouldConserveWildcards || aggressiveMode)) {
          return [wildcards[0]];
        }
      }
    }

    // B. 对子
    if (lastType.type === "pair") {
      // 1. 对子且Free
      for (const v of sortedValues) {
        if (v > lastType.value && groups[v].length === 2) {
          const free = groups[v].filter((c) => !comboIds.has(c.id));
          if (free.length >= 2) {
            if (isTeammate && v >= 14) continue;
            return free.slice(0, 2);
          }
        }
      }
      // 2. 三张拆对(Free)
      for (const v of sortedValues) {
        if (v > lastType.value && groups[v].length === 3) {
          const free = groups[v].filter((c) => !comboIds.has(c.id));
          if (free.length >= 2) {
            if (isTeammate && v >= 14) continue;
            return free.slice(0, 2);
          }
        }
      }
      // 3. 兜底
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
      // 1. 三张且Free
      for (const v of sortedValues) {
        if (v > lastType.value && groups[v].length === 3) {
          const free = groups[v].filter((c) => !comboIds.has(c.id));
          if (free.length >= 3) {
            if (isTeammate && v >= 14) continue;
            return free.slice(0, 3);
          }
        }
      }
      // 2. 兜底
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

        // 1. 如果上家是炸弹，必须炸（选最小的能管上的）
        if (isBomb(lastType.type)) {
          validBombs.sort((a, b) => a.value - b.value);
          return validBombs[0].cards;
        }

        // 2. 队友保护模式：对手快出完了，允许用任何炸弹压制
        if (aggressiveMode) {
          // 优先用小炸弹
          const validSmallBombs = smallBombs.filter((b) =>
            canBeat(b.cards, last, levelCardValue),
          );
          if (validSmallBombs.length > 0) {
            validSmallBombs.sort((a, b) => a.value - b.value);
            return validSmallBombs[0].cards;
          }
          // 小炸弹不够用大炸弹
          const validValuableBombs = valuableBombs.filter((b) =>
            canBeat(b.cards, last, levelCardValue),
          );
          if (validValuableBombs.length > 0) {
            validValuableBombs.sort((a, b) => a.value - b.value);
            return validValuableBombs[0].cards;
          }
        }

        // 3. 拦截逻辑：对手连续出牌 >= 2 次，用小炸弹拦截
        if (shouldIntercept && smallBombs.length > 0) {
          const validSmallBombs = smallBombs.filter((b) =>
            canBeat(b.cards, last, levelCardValue),
          );
          if (validSmallBombs.length > 0) {
            validSmallBombs.sort((a, b) => a.value - b.value);
            return validSmallBombs[0].cards;
          }
        }

        // 4. 残局策略：手牌少时可以用炸弹
        const isEndGame = hand.length <= 10;
        const isUrgent = lastType.value >= 14; // 大牌需要拦截

        if (isEndGame || isUrgent) {
          // 优先用小炸弹
          const validSmallBombs = smallBombs.filter((b) =>
            canBeat(b.cards, last, levelCardValue),
          );
          if (validSmallBombs.length > 0) {
            validSmallBombs.sort((a, b) => a.value - b.value);
            return validSmallBombs[0].cards;
          }

          // 只有在极端紧急时才用大炸弹（手牌 <= 5 或对方出 A 及以上）
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

  // 轮到玩家出牌时，清除该玩家上一轮的动作显示
  useEffect(() => {
    if (gamePhase === "playing") {
      setPlayerActions((prev) => {
        if (!prev[currentPlayer]) return prev;
        const newState = { ...prev };
        delete newState[currentPlayer];
        return newState;
      });
    }
  }, [currentPlayer, gamePhase]);

  useEffect(() => {
    if (gamePhase !== "playing") return;
    if (currentPlayer === 0) return;
    if (finishedOrder.includes(currentPlayer)) return;

    const timer = setTimeout(() => {
      const hand = players[currentPlayer]?.cards || [];
      let move = playsByAI(hand, lastPlayedCards);

      // 兜底逻辑：如果是头家出牌（Leading）且AI未找到有效牌型，强制出最小的一张牌
      if (
        lastPlayedCards.length === 0 &&
        (!move || !canBeat(move, lastPlayedCards, levelCardValue))
      ) {
        if (hand.length > 0) {
          const sorted = [...hand].sort((a, b) => a.value - b.value);
          move = [sorted[0]];
        }
      }

      if (move && canBeat(move, lastPlayedCards, levelCardValue)) {
        handlePlay(currentPlayer, move);
      } else {
        handlePass(currentPlayer);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [
    gamePhase,
    currentPlayer,
    lastPlayedCards,
    players,
    finishedOrder,
    levelCardValue,
  ]);

  const activeTributeForUI = tributeInfos.find(
    (t) => t.status === "pending_pay" || t.status === "pending_return",
  );
  const showTributeButton =
    gamePhase === "tribute" &&
    activeTributeForUI &&
    ((activeTributeForUI.status === "pending_pay" &&
      activeTributeForUI.payerId === 0) ||
      (activeTributeForUI.status === "pending_return" &&
        activeTributeForUI.receiverId === 0));
  const isReturnPhase =
    activeTributeForUI?.status === "pending_return" &&
    activeTributeForUI.receiverId === 0;

  return (
    <div className="game-container-gd">
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">规则与牌型</h2>
            <div className="modal-body">
              <div className="rule-list">
                <div className="rule-title">对局</div>
                <div className="rule-item">
                  <span className="rule-label">人数</span>
                  <div className="rule-cards"> 2V2（相对面玩家为一队）</div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">牌数</span>
                  <div className="rule-cards">
                    两副牌，共 108 张，开局每人 27 张
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">轮数</span>
                  <div className="rule-cards">每场 4 轮，轮末自动结算极牌</div>
                </div>

                <div className="rule-title">提示</div>
                <div className="rule-item">
                  <span className="rule-label">极牌</span>
                  <div className="rule-cards">当前极牌为 {levelRank}</div>
                </div>
                <div className="rule-item align-top">
                  <span className="rule-label">逢人配</span>
                  <div className="rule-cards column-layout">
                    <div className="rule-desc">
                      红桃极牌为逢人配，可代替除大小王外的任意牌
                    </div>
                    <div className="card-row">
                      {renderCard(
                        {
                          id: "-wild-ex",
                          rank: levelRank,
                          suit: "♥",
                          value: 15,
                        },
                        false,
                        false,
                        "mini",
                      )}{" "}
                      {renderCard(
                        {
                          id: "-wild-ex",
                          rank: levelRank,
                          suit: "♥",
                          value: 15,
                        },
                        false,
                        false,
                        "mini",
                      )}
                    </div>
                  </div>
                </div>
                <div className="rule-item align-top">
                  <span className="rule-label">升级</span>
                  <div className="rule-cards column-layout">
                    <div>双上（同队获前两名）：升 3 级</div>
                    <div>单上（同队获一三名）：升 2 级</div>
                    <div>平局（同队获一四名）：升 1 级</div>
                  </div>
                </div>
                <div className="rule-item align-top">
                  <span className="rule-label">进贡</span>
                  <div className="rule-cards column-layout text-left">
                    <div>
                      双上：双贡（给头游最大牌，极牌除外），头游还贡10以下任意牌。
                    </div>
                    <div>
                      单上：单贡（末游给头游大牌），头游还贡10以下任意牌。
                    </div>
                    <div>抗贡：进贡方拿出两个大王可抗贡。</div>
                  </div>
                </div>
                <div className="rule-title">牌型</div>
                <div className="rule-item">
                  <span className="rule-label">单张</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-1", rank: "A", suit: "♠", value: 14 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-3", rank: "8", suit: "♥", value: 8 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-5", rank: "K", suit: "♥", value: 13 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-6", rank: "K", suit: "♣", value: 13 },
                      false,
                      false,
                      "mini",
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">三带二</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-7", rank: "9", suit: "♠", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-8", rank: "9", suit: "♥", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-9", rank: "9", suit: "♣", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-10", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-11", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">顺子</span>
                  <div className="rule-cards">
                    {["7", "8", "9", "10", "J"].map((r, i) =>
                      renderCard(
                        {
                          id: `-s${i}`,
                          rank: r,
                          suit: "♠",
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">连对</span>
                  <div className="rule-cards">
                    {["7", "7", "8", "8", "9", "9"].map((r, i) =>
                      renderCard(
                        {
                          id: `-p${i}`,
                          rank: r,
                          suit: suits[i % 4],
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">钢板</span>
                  <div className="rule-cards">
                    {["8", "8", "8", "9", "9", "9"].map((r, i) =>
                      renderCard(
                        {
                          id: `-t${i}`,
                          rank: r,
                          suit: suits[i % 4],
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                  </div>
                </div>
                <div className="rule-item align-top">
                  <span className="rule-label">炸弹</span>
                  <div className="rule-cards column-layout">
                    <div className="card-row">
                      {renderCard(
                        { id: "-b1", rank: "2", suit: "♠", value: 2 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b2", rank: "2", suit: "♥", value: 2 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b3", rank: "2", suit: "♣", value: 2 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b4", rank: "2", suit: "♦", value: 2 },
                        false,
                        false,
                        "mini",
                      )}
                    </div>
                    <div className="card-row">
                      {["♠", "♥", "♣", "♦", "♠", "♥"].map((suit, i) =>
                        renderCard(
                          { id: `-b6-${i}`, rank: "10", suit: suit, value: 10 },
                          false,
                          false,
                          "mini",
                        ),
                      )}
                    </div>
                    <div className="rule-hint">（最多可至八张）</div>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">同花顺</span>
                  <div className="rule-cards">
                    {["9", "10", "J", "Q", "K"].map((r, i) =>
                      renderCard(
                        {
                          id: `-sf${i}`,
                          rank: r,
                          suit: "♠",
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">四王炸</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-j1", rank: "joker", suit: "🃟", value: 16 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-j2", rank: "joker", suit: "🃟", value: 16 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-j3", rank: "JOKER", suit: "🂿", value: 17 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-j4", rank: "JOKER", suit: "🂿", value: 17 },
                      false,
                      false,
                      "mini",
                    )}
                  </div>
                </div>
              </div>
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

      {showScoreboard && (
        <div className="scoreboard-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>积分表</h2>
              <button
                className="btn btn-primary close-btn"
                onClick={() => setShowScoreboard(false)}
              >
                关闭
              </button>
            </div>
            <div className="score-table-container">
              <table>
                <thead>
                  <tr>
                    <th>轮次</th>
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((r) => (
                      <th key={r}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>队伍一分数</td>
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((r) => {
                      const record = scoreHistory.find((h) => h.round === r);
                      return (
                        <td key={r}>{record ? record.teamLevels[0] : ""}</td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>队伍二分数</td>
                    {Array.from({ length: 7 }, (_, i) => i + 1).map((r) => {
                      const record = scoreHistory.find((h) => h.round === r);
                      return (
                        <td key={r}>{record ? record.teamLevels[1] : ""}</td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="game-wrapper">
        {gamePhase === "init" && <h1 className="game-title">掼蛋</h1>}

        <div className="button-group top-left">
          {gamePhase === "init" && (
            <button className="btn btn-home" onClick={() => setShowRules(true)}>
              规则
            </button>
          )}
          {(gamePhase === "playing" || gamePhase === "end") && (
            <>
              <button
                className="btn btn-home"
                onClick={() => setShowRules(true)}
                title="规则"
              >
                规则
              </button>
              <button
                className="btn btn-purple"
                onClick={() => setShowScoreboard(true)}
              >
                积分表
              </button>
            </>
          )}
        </div>

        <div className="message-box">
          <p className="message-text">{message}</p>
        </div>

        <div className="button-group top-right">
          <button
            onClick={() => navigate("/")}
            className="btn btn-home"
            style={{ marginBottom: gamePhase !== "init" ? "0.1rem" : "0" }}
          >
            返回主页
          </button>
          {gamePhase !== "init" && (
            <>
              <button
                onClick={startMatch}
                className="btn btn-red"
                style={{ marginBottom: "0.1rem" }}
              >
                重新开始
              </button>
            </>
          )}
        </div>

        {gamePhase === "init" && (
          <div className="button-group">
            <button onClick={startMatch} className="btn btn-blue">
              开始游戏
            </button>
          </div>
        )}

        {gamePhase !== "init" && (
          <div className="game-area">
            {/* 出牌展示区域 (覆盖在游戏区域之上) */}
            <div className="played-cards-container">
              {[0, 1, 2, 3].map((pid) => {
                const action = playerActions[pid];
                if (!action) return null;

                return (
                  <div key={pid} className={`played-cards-area pos-${pid}`}>
                    {action.type === "pass" ? (
                      <div className="pass-text">过牌</div>
                    ) : (
                      <div className="played-card-group">
                        {action.cards?.map((card, idx) => (
                          <div key={card.id} style={{ zIndex: idx }}>
                            {renderCard(card, false, false, "small", -1)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="top-player">
              {players[2] && (
                <div
                  className={`player-info ${currentPlayer === 2 ? "active" : ""} ${
                    finishedOrder[0] === 2 ? "landlord" : ""
                  } ${winningTeamId !== null && players[2].teamId === winningTeamId ? "game-winner" : ""}`}
                >
                  <h3 className="player-name">{players[2].name}</h3>
                  <p className="player-cards-count">
                    剩余: {players[2].cards.length} 张
                  </p>
                  <p className="player-stats">
                    出牌: {players[2].playCount || 0}
                  </p>
                  {gamePhase === "end" && players[2].cards.length > 0 && (
                    <div className="remaining-cards">
                      {players[2].cards.map((c) =>
                        renderCard(c, false, false, "mini"),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="side-player left">
              {players[1] && (
                <div
                  className={`player-info ${currentPlayer === 1 ? "active" : ""} ${
                    finishedOrder[0] === 1 && roundLeaderId !== 1
                      ? "winner"
                      : ""
                  } ${roundLeaderId === 1 ? "landlord" : ""} ${winningTeamId !== null && players[1].teamId === winningTeamId ? "game-winner" : ""}`}
                >
                  <h3 className="player-name">{players[1].name}</h3>
                  <p className="player-cards-count">
                    剩余: {players[1].cards.length} 张
                  </p>
                  <p className="player-stats">
                    出牌: {players[1].playCount || 0}
                  </p>
                  {gamePhase === "end" && players[1].cards.length > 0 && (
                    <div className="remaining-cards">
                      {players[1].cards.map((c) =>
                        renderCard(c, false, false, "mini"),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="center-area">
              <div className="table-area">
                <div className="table-header">
                  <div className="table-info-badge">轮次: {roundIndex} / 7</div>
                  <div className="table-info-badge">极牌：{levelRank}</div>
                </div>

                {gamePhase === "tribute" ? (
                  <div className="table-content tribute-area">
                    <div
                      className="tribute-list"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {tributeInfos.map((t, idx) => (
                        <div
                          key={idx}
                          className="tribute-row"
                          style={{
                            background: "rgba(0,0,0,0.5)",
                            padding: "8px",
                            borderRadius: "8px",
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}
                        >
                          <span>
                            {players[t.payerId]?.name}{" "}
                            {t.isAntiTribute ? "抗贡" : "进贡"} ➜{" "}
                            {players[t.receiverId]?.name}
                          </span>
                          {t.payCard && (
                            <div
                              style={{
                                transform: "scale(0.6)",
                                margin: "-20px -10px",
                              }}
                            >
                              {renderCard(t.payCard, false, false, "mini")}
                            </div>
                          )}
                          {t.returnCard && (
                            <div
                              style={{
                                transform: "scale(0.6)",
                                margin: "-20px -10px",
                              }}
                            >
                              {renderCard(t.returnCard, false, false, "mini")}
                            </div>
                          )}
                          <span
                            style={{
                              color:
                                t.status === "done" ||
                                t.status === "anti_tribute_success"
                                  ? "#4caf50"
                                  : "#ff9800",
                            }}
                          >
                            {t.status === "pending_pay"
                              ? "待进贡"
                              : t.status === "pending_return"
                                ? "待还贡"
                                : t.status === "done"
                                  ? "完成"
                                  : "抗贡成功"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // 非进贡阶段，中间区域不显示出牌了，因为已经移到玩家前方
                  <div className="table-empty">
                    {/* 可以留白，或者放一些提示 */}
                  </div>
                )}
              </div>
            </div>

            <div className="side-player right">
              {players[3] && (
                <div
                  className={`player-info ${currentPlayer === 3 ? "active" : ""} ${
                    finishedOrder[0] === 3 ? "landlord" : ""
                  } ${winningTeamId !== null && players[3].teamId === winningTeamId ? "game-winner" : ""}`}
                >
                  <h3 className="player-name">{players[3].name}</h3>
                  <p className="player-cards-count">
                    剩余: {players[3].cards.length} 张
                  </p>
                  <p className="player-stats">
                    出牌: {players[3].playCount || 0}
                  </p>
                  {gamePhase === "end" && players[3].cards.length > 0 && (
                    <div className="remaining-cards">
                      {players[3].cards.map((c) =>
                        renderCard(c, false, false, "mini"),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {gamePhase !== "init" && (
          <div
            className={`player-hand ${currentPlayer === 0 ? "active" : ""} ${
              finishedOrder[0] === 0 ? "landlord" : ""
            } ${winningTeamId !== null && players[0].teamId === winningTeamId ? "game-winner" : ""}`}
            style={{ position: "relative" }}
          >
            <div className="hand-header">
              <div className="hand-controls">
                <button
                  className="btn btn-sort btn-sort-mode"
                  onClick={toggleSortMode}
                  title="切换排序模式"
                >
                  {sortMode === "value" ? "花色" : "大小"}
                </button>
                <button
                  onClick={toggleSortDirection}
                  className={`btn btn-sort sort-direction-toggle ${
                    sortDirection === "default" ? "is-default" : "is-reversed"
                  }`}
                  title="切换排序方向"
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

              {showTributeButton && (
                <div className="button-group">
                  <button
                    onClick={confirmTribute}
                    disabled={
                      isReturnPhase ? selectedCards.length !== 1 : false
                    }
                    className="btn btn-play"
                  >
                    {isReturnPhase ? "还贡" : "自动进贡"}
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

            <div
              className="hand-cards-scroll-container"
              onTouchMove={handleTouchMove}
            >
              {isSmallScreen && myCards.length >= 10 ? (
                <>
                  <div className="hand-cards">
                    {myCards
                      .slice(0, Math.ceil(myCards.length / 2))
                      .map((card, index) => (
                        <div
                          key={card.id}
                          className="card-motion"
                          ref={(el) => {
                            cardMotionRefs.current[card.id] = el;
                          }}
                        >
                          {renderCard(
                            card,
                            gamePhase !== "end" && currentPlayer === 0,
                            selectedCards.includes(card.id),
                            "normal",
                            index,
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="hand-cards" style={{ marginTop: "-6rem" }}>
                    {myCards
                      .slice(Math.ceil(myCards.length / 2))
                      .map((card, index) => (
                        <div
                          key={card.id}
                          className="card-motion"
                          ref={(el) => {
                            cardMotionRefs.current[card.id] = el;
                          }}
                        >
                          {renderCard(
                            card,
                            gamePhase !== "end" && currentPlayer === 0,
                            selectedCards.includes(card.id),
                            "normal",
                            index + Math.ceil(myCards.length / 2),
                          )}
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="hand-cards">
                  {myCards.map((card, index) => (
                    <div
                      key={card.id}
                      className="card-motion"
                      ref={(element) => {
                        cardMotionRefs.current[card.id] = element;
                      }}
                    >
                      {renderCard(
                        card,
                        gamePhase !== "end" && currentPlayer === 0,
                        selectedCards.includes(card.id),
                        "normal",
                        index,
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

export default GuanDan;
