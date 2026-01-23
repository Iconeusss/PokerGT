import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./DDZ.less";
import { evaluateLandlordHand, playsByAI } from "./ai/ddzAI";
import PlayerCard from "../../components/Card/PlayerCard";

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
    }),
  );
  deck.push(
    { suit: "🃟", rank: "joker", id: "joker", value: 16 },
    { suit: "🂿", rank: "JOKER", id: "JOKER", value: 17 },
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
      ].sort((a, b) =>
        sortOrder === "asc" ? a.value - b.value : b.value - a.value,
      );
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
        },
      );
    }
  }, [myCards]);

  // 核心动作封装
  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
    // const type = getDDZType(cardsToPlay);
    const newPlayers = [...players];
    newPlayers[playerId].cards = newPlayers[playerId].cards.filter(
      (card) => !cardsToPlay.find((c) => c.id === card.id),
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
        `🎉 ${newPlayers[playerId].isLandlord ? "地主" : "农民"}获胜！`,
      );
      setGamePhase("end");
      return;
    }

    const nextPlayer = (playerId + 1) % 3;
    setCurrentPlayer(nextPlayer);
    setMessage(
      `${players[playerId].name} 出牌，轮到${players[nextPlayer].name}`,
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
      selectedCards.includes(card.id),
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
        const aiCards = playsByAI(
          players[currentPlayer].cards,
          lastPlayedCards,
          players,
          currentPlayer,
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
                  <span className="rule-label">三带一</span>
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
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">三带二</span>
                  <div className="rule-cards">
                    {renderCard(
                      { id: "-40", rank: "Q", suit: "♠", value: 12 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-41", rank: "Q", suit: "♥", value: 12 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-42", rank: "Q", suit: "♣", value: 12 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-43", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-44", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-12", rank: "4", suit: "♥", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-13", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-14", rank: "6", suit: "♦", value: 6 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-15", rank: "7", suit: "♠", value: 7 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-17", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-18", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-19", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-20", rank: "5", suit: "♠", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-21", rank: "5", suit: "♥", value: 5 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-23", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-24", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-25", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-26", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-27", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-51", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-52", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-53", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-54", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-55", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-56", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-57", rank: "6", suit: "♣", value: 6 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-61", rank: "3", suit: "♥", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-62", rank: "3", suit: "♣", value: 3 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-63", rank: "4", suit: "♦", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-64", rank: "4", suit: "♣", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-65", rank: "4", suit: "♠", value: 4 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-66", rank: "5", suit: "♦", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-67", rank: "5", suit: "♣", value: 5 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-68", rank: "6", suit: "♠", value: 6 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-69", rank: "6", suit: "♥", value: 6 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-29", rank: "2", suit: "♥", value: 15 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-30", rank: "2", suit: "♣", value: 15 },
                      false,
                      false,
                      "mini",
                    )}
                    {renderCard(
                      { id: "-31", rank: "2", suit: "♦", value: 15 },
                      false,
                      false,
                      "mini",
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
                      "mini",
                    )}
                    {renderCard(
                      { id: "-33", rank: "JOKER", suit: "🂿", value: 17 },
                      false,
                      false,
                      "mini",
                    )}
                  </div>
                </div>
              </div>
              <p style={{ marginTop: "1rem" }}>
                <strong>获胜条件：</strong>
                第一个出完所有手牌的玩家的阵营获胜（地主单独一方，两个农民同阵营）。
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
              <PlayerCard
                player={players[1]}
                isActive={
                  currentPlayer === 1 &&
                  (gamePhase === "playing" || gamePhase === "bidding")
                }
                isLandlord={players[1].isLandlord}
                isWinner={gamePhase === "end" && lastPlayerId === 1}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
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
                      renderCard(c, false, false, "normal"),
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
              <PlayerCard
                player={players[2]}
                isActive={
                  currentPlayer === 2 &&
                  (gamePhase === "playing" || gamePhase === "bidding")
                }
                isLandlord={players[2].isLandlord}
                isWinner={gamePhase === "end" && lastPlayerId === 2}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
                reverseCards
              />
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
                  title={
                    sortOrder === "asc" ? "当前：小 → 大" : "当前：大 → 小"
                  }
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
    </div>
  );
};

export default DouDiZhu;
