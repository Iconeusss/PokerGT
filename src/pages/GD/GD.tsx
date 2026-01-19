import React, { useState, useEffect, useRef } from "react";
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

const getGDType = (cards: Card[], levelCard: number = 2): CardType | null => {
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

  const allSameSuit = cards.every((c) => c.suit === cards[0].suit);

  // four_jokers > bomb_${len} > straight_flush
  //  同花顺
  if (len === 5 && allSameSuit) {
    const straightValues = checkStraight(normalCards, wildcardCount, levelCard);
    if (straightValues) {
      return {
        type: "straight_flush",
        value: 10000 + straightValues.maxValue,
        count: 5,
        baseValue: straightValues.maxValue,
      };
    }
  }

  // 四王炸
  const jokers = cards.filter((c) => c.rank === "joker" || c.rank === "JOKER");
  if (len === 4 && jokers.length === 4) {
    return { type: "four_jokers", value: 9000, count: 4 };
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

  // 单张
  if (len === 1) {
    return { type: "single", value: values[0], count: 1 };
  }

  // 对子
  if (len === 2) {
    if (freq[0]?.count === 2 || (freq[0]?.count === 1 && wildcardCount === 1)) {
      const pairValue = freq[0]?.val || values[0];
      return { type: "pair", value: pairValue, count: 2 };
    }
  }

  // 三张
  if (len === 3) {
    const maxFreq = freq[0]?.count || 0;
    if (maxFreq + wildcardCount === 3) {
      return { type: "triple", value: freq[0].val, count: 3 };
    }
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
      levelCard
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
      levelCard
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
  levelCard: number
): { maxValue: number } | null => {
  if (normalCards.length + wildcardCount < 5) return null;

  const normalValues = normalCards
    .map((c) => c.value)
    .filter((v) => v !== levelCard);
  const totalLen = normalCards.length + wildcardCount;

  // 尝试构造顺子
  for (let start = 3; start <= 14 - totalLen + 1; start++) {
    let needed = 0;
    let maxVal = start + totalLen - 1;

    for (let i = 0; i < totalLen; i++) {
      const targetValue = start + i;
      if (targetValue === levelCard) return null; // 不能包含级牌
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
  wildcardCount: number
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
  levelCard: number
): { maxValue: number } | null => {
  const values = normalCards.map((c) => c.value).filter((v) => v !== levelCard);
  const counts: { [key: number]: number } = {};
  values.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });

  // 尝试找从start开始的连续牌型
  for (let start = 3; start <= 14 - patternCount + 1; start++) {
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
        wildcardCount - totalNeeded
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
  levelCard: number
): { maxValue: number } | null => {
  return checkConsecutivePattern(
    normalCards,
    wildcardCount,
    pairCount,
    2,
    levelCard
  );
};

// 辅助函数：检查三顺/钢板（调用通用函数）
const checkConsecutiveTriples = (
  normalCards: Card[],
  wildcardCount: number,
  tripleCount: number,
  levelCard: number
): { maxValue: number } | null => {
  return checkConsecutivePattern(
    normalCards,
    wildcardCount,
    tripleCount,
    3,
    levelCard
  );
};

const canBeat = (
  playedCards: Card[],
  lastCards: Card[],
  levelCard: number
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

const compareBombs = (played: CardType, last: CardType): number => {
  if (!isBomb(played.type) || !isBomb(last.type)) {
    throw new Error("只比较炸弹类型");
  }

  if (played.value > last.value) return 1;
  if (played.value < last.value) return -1;
  return 0;
};

const getBombName = (type: string): string => {
  const bombNames: { [key: string]: string } = {
    straight_flush: "同花顺",
    four_jokers: "四王炸",
    bomb_8: "八炸",
    bomb_7: "七炸",
    bomb_6: "六炸",
    bomb_5: "五炸",
    bomb_4: "四炸",
  };
  return bombNames[type] || "未知";
};

const GuanDan: React.FC = () => {
  const navigate = useNavigate();

  // 状态管理
  const [players, setPlayers] = useState<Player[]>([
    {
      id: 0,
      name: "玩家1 (你)",
      cards: [],
      playCount: 0,
      teamId: 1,
      teamScore: 0,
    },
    { id: 1, name: "玩家2", cards: [], playCount: 0, teamId: 2, teamScore: 0 },
    { id: 2, name: "玩家3", cards: [], playCount: 0, teamId: 1, teamScore: 0 },
    { id: 3, name: "玩家4", cards: [], playCount: 0, teamId: 2, teamScore: 0 },
  ]);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [lastPlayerId, setLastPlayerId] = useState(-1);
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
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const [sortMode, setSortMode] = useState<SortMode>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("default");

  // 极牌
  const [levelCard, setLevelCard] = useState<number>(2);

  // 滑动选牌相关状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"select" | "deselect">("select");

  // 节流Refs
  const dragEndIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const startGame = () => {
    const deck = shuffleDeck(createDeck());
    const newPlayers: Player[] = [
      {
        id: 0,
        name: "玩家1 (你)",
        cards: deck.slice(0, 26).sort((a, b) => b.value - a.value),
        teamId: 0,
        teamScore: 0,
        playCount: 0,
      },
      {
        id: 1,
        name: "玩家2",
        cards: deck.slice(27, 53).sort((a, b) => b.value - a.value),
        teamId: 1,
        teamScore: 0,
        playCount: 0,
      },
      {
        id: 2,
        name: "玩家3",
        cards: deck.slice(54, 80).sort((a, b) => b.value - a.value),
        teamId: 0,
        teamScore: 0,
        playCount: 0,
      },
      {
        id: 3,
        name: "玩家4",
        cards: deck.slice(81, 107).sort((a, b) => b.value - a.value),
        teamId: 1,
        teamScore: 0,
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
    setSortOrder("desc");
  };

  // 切换手牌牌序
  const toggleSortMode = () => {
    const newMode = sortMode === "value" ? "suit" : "value";
    setSortMode(newMode);
    setSortDirection("default"); // 切换模式时重置为默认方向
    sortCards(newMode, "default");
  };

  // 左箭头：反转排序
  const sortReversed = () => {
    setSortDirection("reversed");
    sortCards(sortMode, "reversed");
  };

  // 右箭头：默认排序
  const sortDefault = () => {
    setSortDirection("default");
    sortCards(sortMode, "default");
  };

  // 排序逻辑
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
      const suitOrder: { [key: string]: number } =
        direction === "default"
          ? { joker: 1, spades: 2, clubs: 3, diamonds: 4, hearts: 5 } // 王→黑→梅→方→红
          : { hearts: 1, diamonds: 2, clubs: 3, spades: 4, joker: 5 }; // 红→方→梅→黑→王

      myCards.sort((a, b) => {
        const suitDiff = (suitOrder[a.suit] || 0) - (suitOrder[b.suit] || 0);
        if (suitDiff !== 0) return suitDiff;
        return b.value - a.value; // 同花色内按大小降序
      });
    }

    newPlayers[0].cards = myCards;
    setPlayers(newPlayers);
  };

  // 全局事件监听 (处理滑动结束)
  useEffect(() => {
    getGDType(myCards, levelCard); //避免问题
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
    <div className="game-container-gd">
      <h1 className="game-title">掼蛋 (开发中)</h1>

      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 100,
        }}
      >
        <button onClick={() => navigate("/")} className="btn btn-home">
          返回主页
        </button>
      </div>

      <div className="player-hand active">
        <div className="hand-header">
          <div className="hand-controls">
            <button onClick={toggleSortMode}>
              {sortMode === "value" ? "大小" : "花色"}
            </button>
            <button onClick={sortReversed}>←</button>
            <button onClick={sortDefault}>→</button>
          </div>
          <h3 className="hand-title">
            剩余: {players[0].cards.length} 张
            <span className="player-stats-inline">
              出牌: {players[0].playCount || 0}
            </span>
          </h3>
        </div>
        <div className="hand-cards">
          {myCards.map((card, index) =>
            renderCard(
              card,
              true,
              selectedCards.includes(card.id),
              "normal",
              index
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default GuanDan;
