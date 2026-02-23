import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PlayerCard from "../../components/Card/PlayerCard";
import ScoreBoard from "./components/ScoreBoard";
import { playsByAI } from "./ai/dglzAI";
import "./DGLZ.less";

export interface Card {
  suit: string;
  rank: string;
  id: string;
  value: number;
}

interface Player {
  id: number;
  name: string;
  cards: Card[];
  isComputer: boolean;
  playCount: number;
}

// 游戏常量
const GAME_CONSTANTS = {
  PLAYER_COUNT: 6,
  DECK_COUNT: 3,
  CARDS_PER_PLAYER: 27,
  TOTAL_CARDS: 162,
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
  "2": 15,
  joker: 16,
  JOKER: 17,
};

// 创建牌库
const createDeck = (suffix: string, deckCount: number = 1): Card[] => {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    const deckSuffix = deckCount > 1 ? `${suffix}-${d + 1}` : suffix;
    suits.forEach((suit) =>
      ranks.forEach((rank) => {
        deck.push({
          suit,
          rank,
          id: `${suit}${rank}${deckSuffix}`,
          value: rankValues[rank],
        });
      }),
    );
    deck.push(
      { suit: "🃟", rank: "joker", id: `joker${deckSuffix}`, value: 16 },
      { suit: "🂿", rank: "JOKER", id: `JOKER${deckSuffix}`, value: 17 },
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

// 排序类型
type SortMode = "value" | "suit";
type SortDirection = "default" | "reversed";

// 排序手牌
const sortCardsWithOptions = (
  cards: Card[],
  mode: SortMode = "value",
  direction: SortDirection = "default",
): Card[] => {
  const cardsCopy = [...cards];

  if (mode === "value") {
    // 按大小排序
    if (direction === "default") {
      cardsCopy.sort((a, b) => b.value - a.value);
    } else {
      cardsCopy.sort((a, b) => a.value - b.value);
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

    cardsCopy.sort((a, b) => {
      const suitDiff = getSuitSortValue(a) - getSuitSortValue(b);
      if (suitDiff !== 0) return suitDiff;
      // 同花色内按大小降序
      return b.value - a.value;
    });
  }

  return cardsCopy;
};

// 初始化玩家
const initPlayers = (): Player[] => {
  const playerNames = [
    "玩家1 (你)",
    "玩家2",
    "玩家3",
    "玩家4",
    "玩家5",
    "玩家6",
  ];
  return playerNames.map((name, index) => ({
    id: index,
    name,
    cards: [],
    isComputer: index !== 0,
    playCount: 0,
  }));
};

// 发牌
const dealCards = (
  players: Player[],
  sortMode: SortMode,
  sortDirection: SortDirection,
): Player[] => {
  const deck = shuffleDeck(createDeck("deck", GAME_CONSTANTS.DECK_COUNT));
  const newPlayers = players.map((player, index) => {
    const startIdx = index * GAME_CONSTANTS.CARDS_PER_PLAYER;
    const endIdx = startIdx + GAME_CONSTANTS.CARDS_PER_PLAYER;
    const playerCards = sortCardsWithOptions(
      deck.slice(startIdx, endIdx),
      sortMode,
      sortDirection,
    );
    return { ...player, cards: playerCards, playCount: 0 };
  });
  return newPlayers;
};

// 牌型判断
interface CardType {
  type: string; // 牌型名称
  typeRank: number; // 牌型排名（5张牌用，1-6）
  value: number; // 点数/比较值
  count: number; // 牌数
}

// 判断大小怪（万能牌）
const isJoker = (card: Card): boolean => {
  return card.rank === "joker" || card.rank === "JOKER";
};

// 判断牌型
const getDGLZType = (cards: Card[]): CardType | null => {
  const len = cards.length;
  if (len === 0) return null;

  // 只能出1/2/3/5张
  if (![1, 2, 3, 5].includes(len)) return null;

  // 分离王牌和普通牌
  const jokers = cards.filter(isJoker);
  const normalCards = cards.filter((c) => !isJoker(c));
  const jokerCount = jokers.length;

  // 统计普通牌点数
  const counts: { [key: number]: number } = {};
  normalCards.forEach((c) => {
    counts[c.value] = (counts[c.value] || 0) + 1;
  });
  const uniqueValues = Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b);

  // 单张
  if (len === 1) {
    return { type: "single", typeRank: 0, value: cards[0].value, count: 1 };
  }

  // 对子
  if (len === 2) {
    // 两个王不能组成对子（王只能配普通牌）
    if (jokerCount === 2) return null;
    // 一张王配一张普通牌 或 两张相同点数
    if (
      jokerCount === 1 ||
      (uniqueValues.length === 1 && counts[uniqueValues[0]] === 2)
    ) {
      const pairValue =
        normalCards.length > 0
          ? Math.max(...normalCards.map((c) => c.value))
          : 0;
      return { type: "pair", typeRank: 0, value: pairValue, count: 2 };
    }
    return null;
  }

  // 三条
  if (len === 3) {
    // 找一个点数，使其自然牌 + joker 能凑成三条
    for (const val of uniqueValues) {
      const natural = counts[val];
      const jokersNeeded = Math.max(0, 3 - natural);
      const otherNatural = normalCards.length - natural;
      // joker 必须够凑三条，且剩余自然牌为0（不能有多余的牌）
      if (jokersNeeded <= jokerCount && otherNatural === 0) {
        return { type: "triple", typeRank: 0, value: val, count: 3 };
      }
    }
    // 特殊情况：3个王
    if (jokerCount === 3 && normalCards.length === 0) {
      return { type: "triple", typeRank: 0, value: 0, count: 3 };
    }
    return null;
  }

  // 五张：六种牌型
  if (len === 5) {
    const allSameSuit =
      normalCards.length === 0 ||
      normalCards.every((c) => c.suit === normalCards[0].suit);

    // 辅助：检查是否是顺子（返回最大值，王算最大）
    const checkStraight = (): number | null => {
      if (normalCards.length === 0) return null; // 5个王不能组顺子

      // 2 (value=15) 不能参与顺子，含2直接返回null
      if (normalCards.some((c) => c.value > 14)) return null;

      // 统计每个值的频次，用于处理三副牌中的重复牌
      const valueCounts: { [key: number]: number } = {};
      normalCards.forEach((c) => {
        valueCounts[c.value] = (valueCounts[c.value] || 0) + 1;
      });

      // 顺子范围：3-7 到 10-A (值 3-7 到 10-14)
      // 尝试所有可能的起始位置
      for (let start = 3; start <= 10; start++) {
        let needed = 0;
        const usedCounts: { [key: number]: number } = {};

        for (let i = 0; i < 5; i++) {
          const targetVal = start + i;
          const available =
            (valueCounts[targetVal] || 0) - (usedCounts[targetVal] || 0);
          if (available > 0) {
            usedCounts[targetVal] = (usedCounts[targetVal] || 0) + 1;
          } else {
            needed++;
          }
        }

        // 使用的自然牌数 + joker数 必须恰好等于5
        const usedNormal = Object.values(usedCounts).reduce((a, b) => a + b, 0);
        if (
          needed <= jokerCount &&
          usedNormal + jokerCount === 5 &&
          usedNormal + needed === 5
        ) {
          return start + 4; // 返回顺子最大值
        }
      }

      return null;
    };

    // 1. 五条：某个点数的自然牌 + joker >= 5
    for (const val of uniqueValues) {
      if (counts[val] + jokerCount >= 5) {
        return { type: "five_of_kind", typeRank: 6, value: val, count: 5 };
      }
    }
    // 特殊情况：5个王
    if (jokerCount >= 5 && normalCards.length === 0) {
      return { type: "five_of_kind", typeRank: 6, value: 17, count: 5 };
    }

    // 2. 同花顺
    const straightMax = checkStraight();
    if (straightMax !== null && allSameSuit) {
      return {
        type: "straight_flush",
        typeRank: 5,
        value: straightMax,
        count: 5,
      };
    }

    // 3. 炸弹（四带一）
    for (const val of uniqueValues) {
      const natural = counts[val];
      if (natural >= 5) continue; // 5张相同应该是五条，已在前面处理
      const jokersNeeded = Math.max(0, 4 - natural);
      if (jokersNeeded > jokerCount) continue; // joker 不够凑四条
      const otherNatural = normalCards.length - natural;
      const remainingJokers = jokerCount - jokersNeeded;
      // 第5张牌 = 其他自然牌 + 剩余joker，必须恰好为1
      if (otherNatural + remainingJokers === 1) {
        return { type: "bomb", typeRank: 4, value: val, count: 5 };
      }
    }
    // 特殊情况：4个joker + 1张普通牌
    if (jokerCount >= 4 && normalCards.length === 1) {
      return {
        type: "bomb",
        typeRank: 4,
        value: normalCards[0].value,
        count: 5,
      };
    }

    // 4. 葫芦（三带二）
    for (const tripleVal of uniqueValues) {
      const natural = counts[tripleVal];
      const jokersForTriple = Math.max(0, 3 - natural);
      if (jokersForTriple > jokerCount) continue;

      const remainingJokers = jokerCount - jokersForTriple;
      const otherNaturals = normalCards.filter((c) => c.value !== tripleVal);

      // 剩余牌必须恰好2张（对子部分）
      if (otherNaturals.length + remainingJokers !== 2) continue;

      // 检查能否组成对子
      if (otherNaturals.length === 0) {
        // 2个joker组成对子：不合法（两个王不能组对子）
        continue;
      } else if (otherNaturals.length === 1) {
        // 1张普通+1个joker：合法对子
        return {
          type: "fullhouse",
          typeRank: 3,
          value: tripleVal,
          count: 5,
        };
      } else {
        // 2张普通牌：必须同点数
        if (otherNaturals[0].value === otherNaturals[1].value) {
          return {
            type: "fullhouse",
            typeRank: 3,
            value: tripleVal,
            count: 5,
          };
        }
      }
    }

    // 5. 同花
    if (allSameSuit && normalCards.length >= 1) {
      // 计算同花权重：按点数从大到小排序，计算20进制值，确保逐张比大小
      const sortedValues = cards.map((c) => c.value).sort((a, b) => b - a);
      let weight = 0;
      for (const v of sortedValues) {
        weight = weight * 20 + v;
      }
      return { type: "flush", typeRank: 2, value: weight, count: 5 };
    }

    // 6. 杂顺
    if (straightMax !== null && !allSameSuit) {
      return { type: "straight", typeRank: 1, value: straightMax, count: 5 };
    }

    return null;
  }

  return null;
};

// 比较牌型
const canBeat = (playedCards: Card[], lastCards: Card[]): boolean => {
  // 自由出牌
  if (!lastCards || lastCards.length === 0) {
    return getDGLZType(playedCards) !== null;
  }

  const played = getDGLZType(playedCards);
  const last = getDGLZType(lastCards);

  if (!played || !last) return false;

  // 必须相同牌数
  if (played.count !== last.count) return false;

  // 5张牌先比牌型排名
  if (played.count === 5) {
    if (played.typeRank > last.typeRank) return true;
    if (played.typeRank < last.typeRank) return false;
  }

  // 同牌型比点数
  return played.value > last.value;
};

// 获取中文牌型名称
const getCNTypeName = (type: string): string => {
  const names: { [key: string]: string } = {
    single: "单张",
    pair: "对子",
    triple: "三条",
    straight: "杂顺",
    flush: "同花",
    fullhouse: "葫芦",
    bomb: "炸弹",
    straight_flush: "同花顺",
    five_of_kind: "五条",
  };
  return names[type] || type;
};

const DaGuaiLuZi: React.FC = () => {
  const navigate = useNavigate();

  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 500);
  const [gamePhase, setGamePhase] = useState<"init" | "playing" | "end">(
    "init",
  );
  const [message, setMessage] = useState('点击"开始游戏"发牌');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 500);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- 玩家状态 ---
  const [players, setPlayers] = useState<Player[]>(initPlayers());
  const myCards = players[0]?.cards || [];
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [lastPlayerId, setLastPlayerId] = useState(-1);
  const [passCount, setPassCount] = useState(0);
  // 玩家当前状态（出牌或过牌）- 用于在各自位置显示
  const [playerActions, setPlayerActions] = useState<
    Record<number, { type: "play" | "pass"; cards?: Card[] }>
  >({});
  // 完成游戏的玩家顺序
  const [finishedOrder, setFinishedOrder] = useState<number[]>([]);

  // 积分状态
  const [scores, setScores] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [roundScores, setRoundScores] = useState<number[] | null>(null);
  const [showScoreBoard, setShowScoreBoard] = useState(false);

  // 排序状态
  const [sortOptions, setSortOptions] = useState({
    mode: "value" as SortMode,
    direction: "default" as SortDirection,
  });
  const sortMode = sortOptions.mode;
  const sortDirection = sortOptions.direction;

  // 滑动选牌相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  // Refs
  const dragEndIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const sortFlipFromRectsRef = useRef<Record<string, DOMRect>>({});
  const sortFlipPendingRef = useRef(false);
  const cardMotionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 捕获排序前的位置
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

  // 获取玩家名次名称
  const getPlayerRankName = (pid: number) => {
    // 如果玩家在完成列表中，直接返回名次
    const orderIndex = finishedOrder.indexOf(pid);
    if (orderIndex !== -1) {
      const ranks = ["头家", "二家", "三家", "四家", "五家", "末家"];
      return ranks[orderIndex] || "";
    }

    // 如果不在完成列表中，但游戏已结束，说明是末家
    if (gamePhase === "end") {
      return "末家";
    }

    return undefined;
  };

  // 计算得分
  const calculateScores = (finalFinishedOrder: number[]) => {
    // 找出最后一名（不在 finishedOrder 中的那个）
    const allPlayers = [0, 1, 2, 3, 4, 5];
    const lastPlayer = allPlayers.find((p) => !finalFinishedOrder.includes(p));

    // 完整排名
    const fullOrder =
      lastPlayer !== undefined
        ? [...finalFinishedOrder, lastPlayer]
        : finalFinishedOrder;

    // 积分规则：头家+3, 二家+2, 三家+1, 四家-1, 五家-2, 末家-3
    const scoreMap = [3, 2, 1, -1, -2, -3];

    const newRoundScores = [0, 0, 0, 0, 0, 0];
    fullOrder.forEach((pid, rank) => {
      newRoundScores[pid] = scoreMap[rank] || 0;
    });

    setRoundScores(newRoundScores);
    setScores((prev) => prev.map((s, i) => s + newRoundScores[i]));

    // 延迟显示积分板
    setTimeout(() => {
      setShowScoreBoard(true);
    }, 1500);
  };

  // 开始游戏
  const startGame = () => {
    const newPlayers = dealCards(initPlayers(), sortMode, sortDirection);
    setPlayers(newPlayers);
    setGamePhase("playing");
    setCurrentPlayer(0);
    setSelectedCards([]);
    setLastPlayedCards([]);
    setLastPlayerId(-1);
    setPassCount(0);
    setFinishedOrder([]);
    setRoundScores(null);
    setShowScoreBoard(false);
    setMessage("游戏开始！玩家1的回合，请出牌。");
  };

  // 切换排序模式（大小/花色）
  const toggleSortMode = () => {
    captureSortFlipRects();
    const newMode = sortMode === "value" ? "suit" : "value";
    setSortOptions({ mode: newMode, direction: "default" }); // 切换模式时重置为默认方向
    sortCards(newMode, "default");
  };

  // 切换排序方向
  const toggleSortDirection = () => {
    captureSortFlipRects();
    const nextDirection = sortDirection === "default" ? "reversed" : "default";
    setSortOptions((prev) => ({ ...prev, direction: nextDirection }));
    sortCards(sortMode, nextDirection);
  };

  // 排序手牌
  const sortCards = (mode: SortMode, direction: SortDirection) => {
    const newPlayers = [...players];
    const sortedCards = sortCardsWithOptions(
      [...newPlayers[0].cards],
      mode,
      direction,
    );
    newPlayers[0] = { ...newPlayers[0], cards: sortedCards };
    setPlayers(newPlayers);
  };

  // FLIP 动画
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

  // 出牌
  const playCards = () => {
    const selected = players[0].cards.filter((card) =>
      selectedCards.includes(card.id),
    );
    if (selected.length === 0) {
      setMessage("请先选择要出的牌");
      return;
    }

    // 验证牌型
    const cardType = getDGLZType(selected);
    if (!cardType) {
      setMessage(`❌ 无效牌型！只能出1/2/3/5张，且必须符合规则`);
      return;
    }

    // 验证能否压过
    if (lastPlayedCards.length > 0) {
      if (!canBeat(selected, lastPlayedCards)) {
        const lastType = getDGLZType(lastPlayedCards);
        if (lastType && selected.length !== lastType.count) {
          setMessage(`❌ 必须出${lastType.count}张牌！`);
        } else {
          setMessage(
            `❌ 压不过！需要更大的${getCNTypeName(lastType?.type || "")}`,
          );
        }
        return;
      }
    }

    handlePlay(0, selected);
  };

  // 获取下一个还在游戏中的玩家
  const getNextActivePlayer = (
    currentId: number,
    finished: number[],
  ): number => {
    let next = (currentId + 1) % GAME_CONSTANTS.PLAYER_COUNT;
    let loopCount = 0;
    while (finished.includes(next) && loopCount < GAME_CONSTANTS.PLAYER_COUNT) {
      next = (next + 1) % GAME_CONSTANTS.PLAYER_COUNT;
      loopCount++;
    }
    return next;
  };

  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
    const newPlayers = [...players];
    newPlayers[playerId] = {
      ...newPlayers[playerId],
      cards: newPlayers[playerId].cards.filter(
        (card) => !cardsToPlay.find((c) => c.id === card.id),
      ),
      playCount: (newPlayers[playerId].playCount || 0) + 1,
    };

    setPlayers(newPlayers);
    setLastPlayedCards(cardsToPlay);
    setLastPlayerId(playerId);
    setPassCount(0);
    setSelectedCards([]);

    // 设置该玩家的出牌动作
    setPlayerActions((prev) => {
      // 如果是新的一轮领出（上家ID是-1），清理桌面所有动作
      const isNewRound = lastPlayerId === -1;
      const newState = isNewRound ? {} : { ...prev };
      newState[playerId] = { type: "play", cards: cardsToPlay };
      return newState;
    });

    const newFinishedOrder = [...finishedOrder];
    if (newPlayers[playerId].cards.length === 0) {
      if (!newFinishedOrder.includes(playerId)) {
        newFinishedOrder.push(playerId);
        setFinishedOrder(newFinishedOrder);
      }

      if (newFinishedOrder.length >= GAME_CONSTANTS.PLAYER_COUNT - 1) {
        setMessage(`游戏结束！`);
        setGamePhase("end");
        calculateScores(newFinishedOrder);
        return;
      }
    }

    const nextPlayer = getNextActivePlayer(playerId, newFinishedOrder);
    setCurrentPlayer(nextPlayer);

    const cardType = getDGLZType(cardsToPlay);
    const typeName = cardType ? getCNTypeName(cardType.type) : "牌";

    // 获取名次名称
    const getRankName = (orderIndex: number) => {
      const ranks = ["头家", "二家", "三家", "四家", "五家", "末家"];
      return ranks[orderIndex] || "";
    };

    let msg = `${players[playerId].name} 出牌： ${typeName}`;
    if (newPlayers[playerId].cards.length === 0) {
      const rankIdx = newFinishedOrder.indexOf(playerId);
      msg += ` (${getRankName(rankIdx)})`;
    }
    // msg += `，轮到${players[nextPlayer].name}`;
    setMessage(msg);
  };

  const handlePass = () => {
    const activePlayerCount =
      GAME_CONSTANTS.PLAYER_COUNT - finishedOrder.length;
    const newPassCount = passCount + 1;

    // 如果所有其他在场玩家都过牌了（activePlayerCount - 1），则一轮结束
    if (newPassCount >= activePlayerCount - 1) {
      setLastPlayedCards([]);
      setPassCount(0);

      let nextLead = lastPlayerId;
      // 如果上家已经出完牌了，由上家的下家接风
      if (finishedOrder.includes(lastPlayerId)) {
        nextLead = getNextActivePlayer(lastPlayerId, finishedOrder);
        setMessage(`上家已出完，${players[nextLead].name} 接风`);
      } else {
        if (finishedOrder.includes(nextLead)) {
          nextLead = getNextActivePlayer(nextLead, finishedOrder);
        }
        setMessage(`${players[nextLead].name} 获得出牌权`);
      }

      setLastPlayerId(-1); // 重置上家ID
      // 清除所有玩家的动作状态，新一轮开始
      setPlayerActions({});
      setCurrentPlayer(nextLead);
    } else {
      setPassCount(newPassCount);
      const nextPlayer = getNextActivePlayer(currentPlayer, finishedOrder);

      // 设置当前玩家的过牌动作
      setPlayerActions((prev) => ({
        ...prev,
        [currentPlayer]: { type: "pass" },
      }));

      setMessage(`${players[currentPlayer].name} 过牌`);
      setCurrentPlayer(nextPlayer);
    }
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

  // AI出牌逻辑
  useEffect(() => {
    if (gamePhase !== "playing") return;
    if (currentPlayer === 0) return; // 玩家回合不处理
    if (finishedOrder.includes(currentPlayer)) return; // 已完成的玩家不思考

    const aiDelay = setTimeout(() => {
      const aiPlayer = players[currentPlayer];
      if (!aiPlayer || aiPlayer.cards.length === 0) return;

      const ctx = {
        currentPlayer,
        passCount,
        playerCardCounts: players.map((p) => p.cards.length),
      };

      const aiCards = playsByAI(
        aiPlayer.cards,
        lastPlayedCards,
        ctx,
        getDGLZType,
        canBeat,
      );

      if (aiCards && aiCards.length > 0) {
        // AI出牌
        handlePlay(currentPlayer, aiCards);
      } else {
        // AI过牌
        handlePass();
      }
    }, 800); // AI思考延迟

    return () => clearTimeout(aiDelay);
  }, [
    currentPlayer,
    gamePhase,
    players,
    lastPlayedCards,
    passCount,
    finishedOrder,
    lastPlayerId,
  ]);

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

  // --- 全局事件监听 (处理滑动结束) ---
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

  // --- UI 渲染函数 ---
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
    <div className="game-container-dglz">
      {/* 规则弹窗 */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">规则与牌型</h2>
            <div className="modal-body">
              <div className="rule-list">
                <div className="rule-title">对局</div>
                <div className="rule-item">
                  <span className="rule-label">人数</span>
                  <div className="rule-cards">
                    6人游戏（3V3，相隔玩家为一队）
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">牌数</span>
                  <div className="rule-cards">
                    三副牌，共 162 张，开局每人 27 张
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">目标</span>
                  <div className="rule-cards">先出完手牌的玩家获胜</div>
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

                <div className="rule-title">五张牌型（从小到大）</div>
                <div className="rule-item">
                  <span className="rule-label">1. 杂顺</span>
                  <div className="rule-cards">
                    {["7", "8", "9", "10", "J"].map((r, i) =>
                      renderCard(
                        {
                          id: `-s${i}`,
                          rank: r,
                          suit: suits[i % 4],
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                    <span className="rule-desc">不同花色顺子</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">2. 同花</span>
                  <div className="rule-cards">
                    {["3", "5", "9", "J", "K"].map((r, i) =>
                      renderCard(
                        {
                          id: `-f${i}`,
                          rank: r,
                          suit: "♥",
                          value: rankValues[r],
                        },
                        false,
                        false,
                        "mini",
                      ),
                    )}
                    <span className="rule-desc">相同花色5张</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">3. 葫芦</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-fh1", rank: "9", suit: "♠", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fh2", rank: "9", suit: "♥", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fh3", rank: "9", suit: "♣", value: 9 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fh4", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fh5", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    <span className="rule-desc">三带二</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">4. 炸弹</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-b1", rank: "7", suit: "♠", value: 7 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-b2", rank: "7", suit: "♥", value: 7 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-b3", rank: "7", suit: "♣", value: 7 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-b4", rank: "7", suit: "♦", value: 7 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-b5", rank: "3", suit: "♠", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    <span className="rule-desc">四带一</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">5. 同花顺</span>
                  <div className="rule-cards">
                    {["7", "8", "9", "10", "J"].map((r, i) =>
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
                    <span className="rule-desc">相同花色顺子</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">6. 五条</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-fk1", rank: "A", suit: "♠", value: 14 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fk2", rank: "A", suit: "♥", value: 14 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fk3", rank: "A", suit: "♣", value: 14 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fk4", rank: "A", suit: "♦", value: 14 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-fk5", rank: "A", suit: "♠", value: 14 },
                      false,
                      false,
                      "mini",
                    )}
                    <span className="rule-desc">5张相同点数（最大）</span>
                  </div>
                </div>

                <div className="rule-title">特殊规则</div>
                <div className="rule-item">
                  <span className="rule-label">万能牌</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-w1", rank: "joker", suit: "🃟", value: 16 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-w2", rank: "JOKER", suit: "🂿", value: 17 },
                      false,
                      false,
                      "mini",
                    )}
                    <span className="rule-desc">2张及以上时可替代任意牌</span>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">出牌规则</span>
                  <div className="rule-cards">
                    只能出1/2/3/5张，不同牌数不能互压
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

      <div className="game-wrapper">
        {gamePhase === "init" && <h1 className="game-title">大怪路子</h1>}

        {/* 左上角按钮组 */}
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
                onClick={() => setShowScoreBoard(true)}
              >
                积分表
              </button>
            </>
          )}
        </div>

        {/* 消息提示 */}
        <div className="message-box-dglz">
          <p className="message-text">{message}</p>
        </div>

        {/* 右上角按钮组 */}
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

        {/* 开始游戏按钮 */}
        {gamePhase === "init" && (
          <div className="button-group">
            <button onClick={startGame} className="btn btn-blue">
              开始游戏
            </button>
          </div>
        )}

        {/* 游戏区域 */}
        {gamePhase !== "init" && (
          <div className="game-area">
            {/* 出牌展示区域 - 覆盖在游戏区域之上 */}
            <div className="played-cards-container">
              {[0, 1, 2, 3, 4, 5].map((pid) => {
                const action = playerActions[pid];
                const rankName = getPlayerRankName(pid);
                const isFinished = !!rankName && rankName !== "末家";

                if (!action && !rankName) return null;

                return (
                  <div
                    key={pid}
                    className={`played-cards-area-dglz pos-${pid}`}
                    style={{
                      flexDirection: "column", // 垂直排列，以便同时显示牌和名次
                      gap: "0.5rem",
                    }}
                  >
                    {/* 显示名次徽章 (如果有) */}
                    {isFinished && (
                      <div className="rank-text-badge">{rankName}</div>
                    )}

                    {/* 显示末家徽章 */}
                    {rankName === "末家" && (
                      <div className="rank-text-badge">{rankName}</div>
                    )}

                    {/* 显示出牌动作 */}
                    {action &&
                      (action.type === "pass" ? (
                        <div className="pass-text">过牌</div>
                      ) : (
                        <div className="played-card-group">
                          {[...(action.cards || [])]
                            .sort((a, b) => a.value - b.value)
                            .map((card, idx) => (
                              <div key={card.id} style={{ zIndex: idx }}>
                                {renderCard(card, false, false, "small", -1)}
                              </div>
                            ))}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>

            {/* 顶部电脑玩家 - 顺时针：3 */}
            <div className="top-player">
              <PlayerCard
                player={players[3]}
                isActive={currentPlayer === 3 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && finishedOrder[0] === 3}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>

            {/* 左侧两个电脑玩家 - 顺时针：2(左上), 1(左下) */}
            <div className="side-player left">
              <div className="side-player-item">
                <PlayerCard
                  player={players[2]}
                  isActive={currentPlayer === 2 && gamePhase === "playing"}
                  isLandlord={false}
                  isWinner={gamePhase === "end" && finishedOrder[0] === 2}
                  isGameWinner={false}
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              </div>
              <div className="side-player-item">
                <PlayerCard
                  player={players[1]}
                  isActive={currentPlayer === 1 && gamePhase === "playing"}
                  isLandlord={false}
                  isWinner={gamePhase === "end" && finishedOrder[0] === 1}
                  isGameWinner={false}
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              </div>
            </div>

            {/* 中间游戏区域 (此处放一些中间信息，如大怪路子的计分信息等，目前为空) */}
            <div className="center-area">
              {/* 这里可以放一些中间的装饰或信息 */}
            </div>

            {/* 右侧两个电脑玩家 - 顺时针：4(右上), 5(右下) */}
            <div className="side-player right">
              <div className="side-player-item">
                <PlayerCard
                  player={players[4]}
                  isActive={currentPlayer === 4 && gamePhase === "playing"}
                  isLandlord={false}
                  isWinner={gamePhase === "end" && finishedOrder[0] === 4}
                  isGameWinner={false}
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              </div>
              <div className="side-player-item">
                <PlayerCard
                  player={players[5]}
                  isActive={currentPlayer === 5 && gamePhase === "playing"}
                  isLandlord={false}
                  isWinner={gamePhase === "end" && finishedOrder[0] === 5}
                  isGameWinner={false}
                  showRemainingCards={gamePhase === "end"}
                  renderCard={renderCard}
                />
              </div>
            </div>
          </div>
        )}

        {/* 底部玩家手牌 - 独立于 game-table，占据全宽 */}
        {gamePhase !== "init" && (
          <div
            className={`player-hand ${currentPlayer === 0 ? "active" : ""} ${
              gamePhase === "end" && finishedOrder[0] === 0 ? "winner" : ""
            }`}
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
                {/* {getPlayerRankName(0) && (
                  <span
                    className="player-rank-badge"
                    style={{ marginRight: "0.5rem", fontSize: "1rem" }}
                  >
                    {getPlayerRankName(0)}
                  </span>
                )} */}
                剩余: {players[0].cards.length} 张
                <span className="player-stats-inline">
                  出牌: {players[0].playCount || 0}
                </span>
              </h3>

              {currentPlayer === 0 && gamePhase === "playing" && (
                <div className="button-group">
                  <button
                    onClick={handlePass}
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
                      .map((card, idx) => (
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
                            idx,
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="hand-cards" style={{ marginTop: "-2rem" }}>
                    {myCards
                      .slice(Math.ceil(myCards.length / 2))
                      .map((card, idx) => (
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
                            idx + Math.ceil(myCards.length / 2),
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
                        idx,
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* 积分板 */}
      {showScoreBoard && (
        <ScoreBoard
          scores={scores}
          roundScores={roundScores}
          onClose={() => setShowScoreBoard(false)}
          onRestart={gamePhase === "end" ? startGame : undefined}
        />
      )}
    </div>
  );
};

export default DaGuaiLuZi;
