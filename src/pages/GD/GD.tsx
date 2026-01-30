import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./GD.less";
import PlayerCard from "../../components/Card/PlayerCard";
import { playsByAI as gdPlaysByAI } from "./ai/gdAI";

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
  isAntiTribute: boolean;
  antiTributeJokers?: Card[]; // 抗贡
  status: "pending_pay" | "pending_return" | "done" | "anti_tribute_success";
}

type SortMode = "suit" | "value";
type SortDirection = "default" | "reversed";

// 常量
const GAME_CONSTANTS = {
  LEVEL_CARD_VALUE: 15,
  CARDS_PER_PLAYER: 27,
  TOTAL_CARDS: 108,
  PLAYER_COUNT: 4,
  MAX_ROUNDS: 7,
  AI_PLAY_DELAY_MS: 900,
  ROUND_END_DELAY_MS: 1600,
  TRIBUTE_DELAY_MS: 1000,
  TRIBUTE_SUCCESS_DELAY_MS: 5000,
};

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

const createDeck = (suffix: string, deckCount: number): Card[] => {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    const deckSuffix = deckCount > 1 ? `${suffix}-${d + 1}` : suffix;
    suits.forEach((suit) =>
      ranks.forEach((rank) => {
        deck.push({
          suit,
          rank,
          id: `${suit}${rank}-${deckSuffix}`,
          value: rankValues[rank],
        });
      }),
    );
    deck.push(
      { suit: "🃟", rank: "joker", id: `joker-${deckSuffix}`, value: 16 },
      { suit: "🂿", rank: "JOKER", id: `JOKER-${deckSuffix}`, value: 17 },
    );
  }
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
    if (
      freq[0]?.count === 2 ||
      (freq[0]?.count === 1 && wildcardCount === 1) ||
      wildcardCount === 2
    ) {
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

// 比较
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
      value = 15; // A14 级牌15 小王16
      if (c.suit === "♥") {
        isWild = true; // 万能
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
  // 玩家当前状态（出牌或过牌）
  const [playerActions, setPlayerActions] = useState<
    Record<number, { type: "play" | "pass"; cards?: Card[] }>
  >({});

  // 弹窗状态
  const [modals, setModals] = useState({
    showRules: false,
    showScoreboard: false,
  });
  const showRules = modals.showRules;
  const showScoreboard = modals.showScoreboard;

  const [scoreHistory, setScoreHistory] = useState<
    { round: number; teamLevels: Record<number, LevelRank> }[]
  >([]);

  // 回合状态
  const [roundState, setRoundState] = useState({
    index: 1,
    finishedOrder: [] as number[],
    leaderId: 0,
  });
  const roundIndex = roundState.index;
  const finishedOrder = roundState.finishedOrder;
  const roundLeaderId = roundState.leaderId;

  const myCards = players[0].cards;
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  // 排序选项
  const [sortOptions, setSortOptions] = useState({
    mode: "value" as SortMode,
    direction: "default" as SortDirection,
  });
  const sortMode = sortOptions.mode;
  const sortDirection = sortOptions.direction;

  // 级牌状态
  const [levelState, setLevelState] = useState({
    rank: "2" as LevelRank,
    teamLevels: { 0: "2", 1: "2" } as Record<number, LevelRank>,
  });
  const levelRank = levelState.rank;
  const teamLevels = levelState.teamLevels;
  const levelCardValue = 15;

  // 拖拽状态
  const [dragState, setDragState] = useState({
    isDragging: false,
    startIndex: null as number | null,
    endIndex: null as number | null,
    mode: "select" as "select" | "deselect",
  });
  const isDragging = dragState.isDragging;
  const dragStartIndex = dragState.startIndex;
  const dragEndIndex = dragState.endIndex;
  const dragMode = dragState.mode;

  const dragEndIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const sortFlipFromRectsRef = useRef<Record<string, DOMRect>>({});
  const sortFlipPendingRef = useRef(false);
  const cardMotionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 用于清理 endRound 中的 setTimeout
  const roundEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理 roundEndTimer
  useEffect(() => {
    return () => {
      if (roundEndTimerRef.current) {
        clearTimeout(roundEndTimerRef.current);
      }
    };
  }, []);

  // 获取最大的非级牌
  const getMaxTributeCard = (cards: Card[], lvlRank: string): Card | null => {
    const candidates = cards.filter((c) => c.rank !== lvlRank);
    if (candidates.length === 0) return null;
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
        // setMessage("进贡成功");
        const timer = setTimeout(() => {
          // 显示下一轮信息
          const roundMsg = `第 ${roundIndex + 1} / 2 轮开始，当前级牌：${levelRank} (本方:${teamLevels[0]}, 对方:${teamLevels[1]})`;
          setMessage(roundMsg);
          setGamePhase("playing");

          // 决定谁先出牌 双贡时比较两张贡牌
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

            if (maxPayerId !== -1) starterId = maxPayerId;
            setCurrentPlayer(starterId);
          }
        }, 5000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // 优先处理进贡
    if (pendingPayTributes.length > 0) {
      // 分离AI进贡和玩家进贡
      const aiPayTributes = pendingPayTributes.filter((t) => t.payerId !== 0);
      const humanPayTribute = pendingPayTributes.find((t) => t.payerId === 0);

      // 检查单个玩家双大王
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

      // 检查双贡情况下多个玩家是否合起来有双大王（组合抗贡）
      const checkMultiPlayerDoubleJoker = () => {
        if (pendingPayTributes.length < 2) return null;

        // 收集所有需要进贡玩家的大王
        const allJokers: { playerId: number; joker: Card }[] = [];
        for (const tribute of pendingPayTributes) {
          const p = players[tribute.payerId];
          const playerJokers = p.cards.filter((c) => c.rank === "JOKER");
          playerJokers.forEach((joker) => {
            allJokers.push({ playerId: tribute.payerId, joker });
          });
        }

        // 如果总共有2张或以上大王，可以组合抗贡
        if (allJokers.length >= 2) {
          return {
            playerIds: [
              ...new Set(allJokers.slice(0, 2).map((j) => j.playerId)),
            ],
            jokers: allJokers.slice(0, 2).map((j) => j.joker),
            jokerSources: allJokers.slice(0, 2),
          };
        }
        return null;
      };

      const singlePlayerDoubleJoker = checkSinglePlayerDoubleJoker();
      const multiPlayerDoubleJoker = !singlePlayerDoubleJoker
        ? checkMultiPlayerDoubleJoker()
        : null;
      if (singlePlayerDoubleJoker) {
        // 单个玩家有双大王，自动抗贡
        let innerTimer: ReturnType<typeof setTimeout> | null = null;
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
              antiTributeJokers: t.payerId === playerId ? jokers : undefined,
            })),
          );
          // 开始下一轮
          innerTimer = setTimeout(() => {
            setGamePhase("playing");
            setMessage("抗贡成功，游戏开始");
            // 抗贡成功时，进贡方先出
            setCurrentPlayer(singlePlayerDoubleJoker.playerId);
          }, 5000);
        }, 1000);
        return () => {
          clearTimeout(timer);
          if (innerTimer) clearTimeout(innerTimer);
        };
      }

      // 多个玩家合起来有双大王，自动组合抗贡
      if (multiPlayerDoubleJoker) {
        let innerTimer: ReturnType<typeof setTimeout> | null = null;
        const timer = setTimeout(() => {
          const { playerIds, jokers, jokerSources } = multiPlayerDoubleJoker;
          const playerNames = playerIds.map((id) => `玩家${id + 1}`).join("、");
          setMessage(
            `抗贡成功！${playerNames} 合力出示大王：${jokers.map((j) => j.suit).join(" ")}`,
          );
          setTributeInfos((prev) =>
            prev.map((t) => {
              // 找到这个 tribute 对应的大王
              const jokerForTribute = jokerSources.find(
                (js) => js.playerId === t.payerId,
              );
              return {
                ...t,
                isAntiTribute: true,
                status: "anti_tribute_success",
                antiTributeJokers: jokerForTribute
                  ? [jokerForTribute.joker]
                  : undefined,
              };
            }),
          );
          // 5秒后开始下一轮
          innerTimer = setTimeout(() => {
            setGamePhase("playing");
            setMessage("抗贡成功，游戏开始");
            // 抗贡成功时，第一个出大王的玩家先出
            setCurrentPlayer(playerIds[0]);
          }, 5000);
        }, 1000);
        return () => {
          clearTimeout(timer);
          if (innerTimer) clearTimeout(innerTimer);
        };
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
                // 记录大王牌用于显示
                const joker =
                  payInfo?.card.rank === "JOKER"
                    ? [payInfo.card]
                    : t.payCard?.rank === "JOKER"
                      ? [t.payCard]
                      : undefined;
                if (payInfo) {
                  return {
                    ...t,
                    payCard: payInfo.card,
                    isAntiTribute: true,
                    status: "anti_tribute_success",
                    antiTributeJokers: joker,
                  };
                }
                if (t.payCard) {
                  return {
                    ...t,
                    isAntiTribute: true,
                    status: "anti_tribute_success",
                    antiTributeJokers: joker,
                  };
                }
                return {
                  ...t,
                  isAntiTribute: true,
                  status: "anti_tribute_success",
                };
              }),
            );
            // 5秒后开始下一轮 (内部 setTimeout 在组件卸载前会执行完毕)
            // 因为外部 timer 只有 1 秒延迟，而内部需要额外 5 秒
            let innerTimer: ReturnType<typeof setTimeout> | null = null;
            innerTimer = setTimeout(() => {
              setGamePhase("playing");
              setMessage("抗贡成功，游戏开始");
              // 找到贡大王的玩家先出
              const firstJokerPayer =
                jokerSources[0]?.tribute.payerId ??
                existingJokerSources[0]?.payerId ??
                0;
              setCurrentPlayer(firstJokerPayer);
            }, 5000);
            // 保存引用以便清理
            return () => {
              clearTimeout(timer);
              if (innerTimer) clearTimeout(innerTimer);
            };
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
          // AI 还贡最小的 <= 10 的非级牌
          const validCards = p.cards.filter((c) => c.rank !== levelRank);
          validCards.sort((a, b) => a.value - b.value);

          let returnCard = validCards.find((c) => c.value <= 10);
          if (!returnCard) {
            returnCard = validCards[0]; // 兜底用最小的
          }

          if (returnCard) {
            handleTributeMove(pendingReturnTribute, returnCard, "return");
          }
        }, GAME_CONSTANTS.TRIBUTE_DELAY_MS);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase, tributeInfos, players, levelRank, roundIndex, teamLevels]);

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
    const deck = shuffleDeck(createDeck("deck", 2));
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

    return players.map((props, index) => ({
      ...props,
      cards: hands[index],
      playCount: 0,
    }));
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
      const loser1 = prevOrder[2];
      const loser2 = prevOrder[3];

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

    setCurrentPlayer(startingPlayerId);
    setRoundState((prev) => ({ ...prev, leaderId: -1 }));
    setLastPlayedCards([]);
    setLastPlayerId(-1);
    setPlayerActions({});
    setPassCount(0);
    setRoundState((prev) => ({
      ...prev,
      finishedOrder: [],
      index: nextRoundIndex,
    }));
    setSortOptions({ mode: "value", direction: "default" });

    setLevelState({ rank: activeLevel, teamLevels: nextTeamLevels });

    // 进贡逻辑
    let nextPhase: "playing" | "tribute" = "playing";
    let nextMessage = `第 ${nextRoundIndex} / 2 轮开始，当前级牌：${activeLevel} (本方:${nextTeamLevels[0]}, 对方:${nextTeamLevels[1]})`;

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
    setSortOptions({ mode: newMode, direction: "default" }); // 切换模式时重置为默认方向
    sortCards(newMode, "default");
  };

  const toggleSortDirection = () => {
    captureSortFlipRects();
    const nextDirection = sortDirection === "default" ? "reversed" : "default";
    setSortOptions((prev) => ({ ...prev, direction: nextDirection }));
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

  // 滑动选牌
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
            setDragState((prev) => ({
              ...prev,
              endIndex: dragEndIndexRef.current,
            }));
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
      setDragState({
        isDragging: false,
        startIndex: null,
        endIndex: null,
        mode: "select",
      });
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
            setDragState({
              isDragging: true,
              startIndex: index,
              endIndex: index,
              mode: isSelected ? "deselect" : "select",
            });
          }
        }}
        onPointerEnter={() => {
          if (isSelectable && isDragging && index !== -1) {
            // 使用 requestAnimationFrame 进行节流，避免高频重绘
            dragEndIndexRef.current = index;
            if (rafRef.current === null) {
              rafRef.current = requestAnimationFrame(() => {
                setDragState((prev) => ({
                  ...prev,
                  endIndex: dragEndIndexRef.current,
                }));
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
    const maxLevelIdx = levelSequence.length - 1; // A索引 length-1

    let isGameOver = false;
    let finalWinningTeam = -1;

    if (nextLevelIdxRaw > maxLevelIdx) {
      isGameOver = true;
      finalWinningTeam = firstTeam;
    }

    const nextTeamLevel = bumpLevelRank(currentTeamLevel, delta);

    const nextTeamLevels = {
      ...teamLevels,
      [firstTeam]: nextTeamLevel,
    };

    setLevelState((prev) => ({ ...prev, teamLevels: nextTeamLevels }));

    // 记录本轮结束后的分数
    setScoreHistory((prev) => {
      if (prev.some((h) => h.round === roundIndex)) return prev;
      return [...prev, { round: roundIndex, teamLevels: nextTeamLevels }];
    });

    // 下一把的级牌由获胜方决定
    const winnerTeamId = firstTeam;
    const nextActiveLevel = nextTeamLevels[winnerTeamId];

    const winnerNames = finalOrder.map(
      (pid) => players[pid]?.name ?? `玩家${pid + 1}`,
    );

    let endMsg = `第 ${roundIndex} / 2 轮结束：${winnerNames.join(" → ")}。队伍${firstTeam + 1}升级 + ${delta}，下轮级牌：${nextActiveLevel}`;

    if (isGameOver) {
      setGamePhase("end");
      setWinningTeamId(finalWinningTeam);
      setMessage(
        `游戏结束！队伍${finalWinningTeam + 1} 率先打过A级，获得最终胜利！`,
      );
      return;
    }

    if (roundIndex >= 2) {
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
        setMessage(`游戏结束，${reason}，队伍${finalWinner + 1}获胜！`);
      } else {
        setMessage(`游戏结束，${reason}，平局！`);
      }
      return;
    }

    setMessage(endMsg);

    // 使用 ref 存储定时器，便于组件卸载时清理
    roundEndTimerRef.current = setTimeout(() => {
      const nextStarter = finalOrder.length >= 4 ? finalOrder[3] : 0;
      startRound(
        roundIndex + 1,
        nextTeamLevels,
        nextActiveLevel,
        nextStarter,
        finalOrder,
      );
    }, GAME_CONSTANTS.ROUND_END_DELAY_MS);
  };

  const maybeFinishPlayer = (playerId: number, nextPlayers: Player[]) => {
    if (nextPlayers[playerId].cards.length !== 0) return;
    setRoundState((prev) => {
      if (prev.finishedOrder.includes(playerId)) return prev;
      const nextOrder = [...prev.finishedOrder, playerId];
      if (nextOrder.length >= 3) {
        const remaining = [0, 1, 2, 3].find((pid) => !nextOrder.includes(pid));
        const finalOrder =
          remaining !== undefined ? [...nextOrder, remaining] : nextOrder;
        setTimeout(() => endRound(finalOrder), 250);
        return { ...prev, finishedOrder: finalOrder };
      }
      return { ...prev, finishedOrder: nextOrder };
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

      // 添加牌到各玩家 贡牌 -> 接收者 还牌 -> 进贡者
      setPlayers((prev) => {
        const next = [...prev];
        const payerIndex = next.findIndex((p) => p.id === tribute.payerId);
        const receiverIndex = next.findIndex(
          (p) => p.id === tribute.receiverId,
        );

        if (payerIndex !== -1 && tribute.payCard) {
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

  // 测试
  const testDistributedJokers = () => {
    const joker0: Card = { suit: "🂿", rank: "JOKER", value: 17, id: "test-j1" };
    // const joker1: Card = { suit: "🂿", rank: "JOKER", value: 17, id: "test-j1" };
    const paddingCards0 = Array.from({ length: 26 }, (_, i) => ({
      suit: "♠",
      rank: "3",
      value: 3,
      id: `test-pad0-${i}`,
    }));
    const hand0 = [joker0, ...paddingCards0];

    // const joker2: Card = { suit: "🂿", rank: "joker", value: 16, id: "test-j2" };
    const joker2: Card = { suit: "🂿", rank: "JOKER", value: 17, id: "test-j2" };
    const paddingCards2 = Array.from({ length: 25 }, (_, i) => ({
      suit: "♠",
      rank: "3",
      value: 3,
      id: `test-pad2-${i}`,
    }));
    const hand2 = [joker2, ...paddingCards2];

    setPlayers((prev) => {
      const next = [...prev];
      next[0] = { ...next[0], cards: hand0 };
      next[2] = { ...next[2], cards: hand2 };
      return next;
    });

    // 进贡
    const tributes: TributeInfo[] = [
      {
        payerId: 0,
        receiverId: 1,
        status: "pending_pay",
        isAntiTribute: false,
      },
      {
        payerId: 2,
        receiverId: 3,
        status: "pending_pay",
        isAntiTribute: false,
      },
    ];
    setTributeInfos(tributes);
    setGamePhase("tribute");
    setMessage("DEV: 测试进贡");
  };

  const confirmTribute = () => {
    // 优先处理玩家的进贡/还贡任务
    const activeTribute =
      tributeInfos.find(
        (t) =>
          (t.status === "pending_pay" && t.payerId === 0) ||
          (t.status === "pending_return" && t.receiverId === 0),
      ) ||
      tributeInfos.find(
        (t) => t.status === "pending_pay" || t.status === "pending_return",
      );
    if (!activeTribute) return;

    if (activeTribute.status === "pending_pay" && activeTribute.payerId === 0) {
      // 自动进贡最大的非级牌
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

      // 规则：还贡的牌必须 <= 10 且不是级牌
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

      // 记录最后一个过牌动作
      setPlayerActions((prev) => ({
        ...prev,
        [playerId]: { type: "pass" },
      }));

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
      // 使用提取的 AI 函数
      const aiContext = {
        currentPlayer,
        lastPlayerId,
        players,
        passCount,
        consecutivePlayCounts,
        levelCardValue,
      };
      let move = gdPlaysByAI(
        hand,
        lastPlayedCards,
        aiContext,
        getGDType,
        canBeat,
        isBomb,
      );

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
    }, GAME_CONSTANTS.AI_PLAY_DELAY_MS);

    return () => clearTimeout(timer);
    // 注意：handlePlay, handlePass, playsByAI, consecutivePlayCounts 在组件内部定义，
    // 依赖于其他状态，此处省略以避免无限循环。players 变化时会触发重新评估。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gamePhase,
    currentPlayer,
    lastPlayedCards,
    players,
    finishedOrder,
    levelCardValue,
  ]);

  // 优先显示玩家进贡
  const activeTributeForUI =
    tributeInfos.find(
      (t) =>
        (t.status === "pending_pay" && t.payerId === 0) ||
        (t.status === "pending_return" && t.receiverId === 0),
    ) ||
    tributeInfos.find(
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

  // const getScreenOrientation = () => {
  //   // if ()
  // };
  // console.log(screen.orientation);
  // console.log(window.screen);

  return (
    <div className="game-container-gd">
      {showRules && (
        <div
          className="modal-overlay"
          onClick={() => setModals((prev) => ({ ...prev, showRules: false }))}
        >
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
                  <div className="rule-cards">每场 7 轮，轮末自动结算级牌</div>
                </div>

                <div className="rule-title">提示</div>
                <div className="rule-item">
                  <span className="rule-label">级牌</span>
                  <div className="rule-cards">当前级牌为 {levelRank}</div>
                </div>
                <div className="rule-item align-top">
                  <span className="rule-label">逢人配</span>
                  <div className="rule-cards column-layout">
                    <div className="rule-desc">
                      红桃级牌为逢人配，可代替除大小王外的任意牌
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
                      双上：双贡（给头游最大牌，级牌除外），头游还贡10以下任意牌。
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
              onClick={() =>
                setModals((prev) => ({ ...prev, showRules: false }))
              }
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
                onClick={() =>
                  setModals((prev) => ({ ...prev, showScoreboard: false }))
                }
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
            <button
              className="btn btn-home"
              onClick={() =>
                setModals((prev) => ({ ...prev, showRules: true }))
              }
            >
              规则
            </button>
          )}
          {(gamePhase === "playing" ||
            gamePhase === "end" ||
            gamePhase === "tribute") && (
            <>
              <button
                className="btn btn-home"
                onClick={() =>
                  setModals((prev) => ({ ...prev, showRules: true }))
                }
                title="规则"
              >
                规则
              </button>
              <button
                className="btn btn-purple"
                onClick={() =>
                  setModals((prev) => ({ ...prev, showScoreboard: true }))
                }
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
            className={`btn btn-home ${gamePhase !== "init" ? "btn-margin-bottom" : ""}`}
          >
            返回主页
          </button>
          {gamePhase !== "init" && (
            <>
              <button
                onClick={startMatch}
                className="btn btn-red btn-margin-bottom"
              >
                重新开始
              </button>
              <button
                onClick={testDistributedJokers}
                className="btn btn-primary btn-margin-bottom btn-test"
              >
                测试抗贡
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
                <PlayerCard
                  player={players[2]}
                  isActive={currentPlayer === 2}
                  isLandlord={finishedOrder[0] === 2}
                  isWinner={false}
                  isGameWinner={
                    gamePhase === "end" &&
                    winningTeamId !== null &&
                    players[2].teamId === winningTeamId
                  }
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              )}
            </div>

            <div className="side-player left">
              {players[1] && (
                <PlayerCard
                  player={players[1]}
                  isActive={currentPlayer === 1}
                  isLandlord={roundLeaderId === 1}
                  isWinner={finishedOrder[0] === 1 && roundLeaderId !== 1}
                  isGameWinner={
                    gamePhase === "end" &&
                    winningTeamId !== null &&
                    players[1].teamId === winningTeamId
                  }
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              )}
            </div>

            <div className="center-area">
              <div className="table-area">
                <div className="table-header">
                  <div className="table-info-badge">轮次: {roundIndex} / 2</div>
                  <div className="table-info-badge">级牌：{levelRank}</div>
                </div>

                {gamePhase === "tribute" ? (
                  <div className="table-content tribute-area">
                    <div className="tribute-list">
                      {tributeInfos.map((t, idx) => (
                        <div key={idx} className="tribute-row">
                          <span>
                            {players[t.payerId]?.name}{" "}
                            {t.isAntiTribute ? "抗贡" : "进贡"} ➜{" "}
                            {players[t.receiverId]?.name}
                          </span>
                          {t.payCard && (
                            <div className="tribute-card-preview">
                              {renderCard(t.payCard, false, false, "mini")}
                            </div>
                          )}
                          {t.returnCard && (
                            <div className="tribute-card-preview">
                              {renderCard(t.returnCard, false, false, "mini")}
                            </div>
                          )}
                          {/* 抗贡大王 */}
                          {t.antiTributeJokers &&
                            t.antiTributeJokers.length > 0 && (
                              <div className="tribute-jokers-preview">
                                {t.antiTributeJokers.map((joker) =>
                                  renderCard(joker, false, false, "mini"),
                                )}
                              </div>
                            )}
                          <span
                            className={`tribute-status ${
                              t.status === "done" ||
                              t.status === "anti_tribute_success"
                                ? "done"
                                : "pending"
                            }`}
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
                  <div className="table-empty">{/*  */}</div>
                )}
              </div>
            </div>

            <div className="side-player right">
              {players[3] && (
                <PlayerCard
                  player={players[3]}
                  isActive={currentPlayer === 3}
                  isLandlord={finishedOrder[0] === 3}
                  isWinner={false}
                  isGameWinner={
                    gamePhase === "end" &&
                    winningTeamId !== null &&
                    players[3].teamId === winningTeamId
                  }
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              )}
            </div>
          </div>
        )}

        {gamePhase !== "init" && (
          <div
            className={`player-hand ${currentPlayer === 0 ? "active" : ""} ${
              finishedOrder[0] === 0 ? "landlord" : ""
            } ${
              gamePhase === "end" &&
              winningTeamId !== null &&
              players[0].teamId === winningTeamId
                ? "game-winner"
                : ""
            }`}
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
                  <div className="hand-cards hand-cards-second-row">
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
