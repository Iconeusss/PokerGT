import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PlayerCard from "../../components/Card/PlayerCard";
import "./DGLZ.less";

// --- 基础接口与常量 ---
interface Card {
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
  PLAYER_COUNT: 6, // 6人游戏（1个用户 + 5个电脑）
  DECK_COUNT: 3, // 3副牌
  CARDS_PER_PLAYER: 27, // 每人27张牌
  TOTAL_CARDS: 162, // 3副牌共162张
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

// --- 工具函数 ---
// 创建多副牌
const createDeck = (deckCount: number = 1): Card[] => {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    const deckSuffix = deckCount > 1 ? `-${d + 1}` : "";
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
      // 降序（大到小）
      cardsCopy.sort((a, b) => b.value - a.value);
    } else {
      // 升序（小到大）
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
  const deck = shuffleDeck(createDeck(GAME_CONSTANTS.DECK_COUNT));
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

  // 出牌 (暂时简化)
  const playCards = () => {
    const selected = players[0].cards.filter((card) =>
      selectedCards.includes(card.id),
    );
    if (selected.length === 0) {
      setMessage("请先选择要出的牌");
      return;
    }
    // TODO: 添加牌型验证
    handlePlay(0, selected);
  };

  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
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

    // 设置该玩家的出牌动作
    setPlayerActions((prev) => ({
      ...prev,
      [playerId]: { type: "play", cards: cardsToPlay },
    }));

    if (newPlayers[playerId].cards.length === 0) {
      setMessage(`🎉 ${newPlayers[playerId].name} 获胜！`);
      setGamePhase("end");
      return;
    }

    const nextPlayer = (playerId + 1) % GAME_CONSTANTS.PLAYER_COUNT;
    setCurrentPlayer(nextPlayer);
    setMessage(
      `${players[playerId].name} 出牌，轮到${players[nextPlayer].name}`,
    );
  };

  const handlePass = () => {
    const newPassCount = passCount + 1;
    setPassCount(newPassCount);
    const nextPlayer = (currentPlayer + 1) % GAME_CONSTANTS.PLAYER_COUNT;
    setCurrentPlayer(nextPlayer);

    // 设置当前玩家的过牌动作
    setPlayerActions((prev) => ({
      ...prev,
      [currentPlayer]: { type: "pass" },
    }));

    if (newPassCount >= GAME_CONSTANTS.PLAYER_COUNT - 1) {
      setLastPlayedCards([]);
      setPassCount(0);
      // 清除所有玩家的动作状态，新一轮开始
      setPlayerActions({});
      setMessage(`${players[nextPlayer].name} 获得出牌权`);
    } else {
      setMessage(`${players[currentPlayer].name} 过牌`);
    }
  };

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
                <div className="rule-item align-top">
                  <span className="rule-label">炸弹</span>
                  <div className="rule-cards column-layout">
                    <div className="card-row">
                      {renderCard(
                        { id: "-b1", rank: "2", suit: "♠", value: 15 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b2", rank: "2", suit: "♥", value: 15 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b3", rank: "2", suit: "♣", value: 15 },
                        false,
                        false,
                        "mini",
                      )}
                      {renderCard(
                        { id: "-b4", rank: "2", suit: "♦", value: 15 },
                        false,
                        false,
                        "mini",
                      )}
                    </div>
                    <div className="rule-hint">（4张及以上同点数牌）</div>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-label">王炸</span>
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
                onClick={() => {
                  // TODO: 积分表功能
                  setMessage("积分表功能开发中...");
                }}
              >
                积分表
              </button>
            </>
          )}
        </div>

        {/* 消息提示 */}
        <div className="message-box">
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
        <div className="game-table">
          {/* 左侧两个电脑玩家 - 顺时针：2(左上), 1(左下) */}
          <div className="left-players">
            <div className="side-player">
              <PlayerCard
                player={players[2]}
                isActive={currentPlayer === 2 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && lastPlayerId === 2}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>
            <div className="side-player">
              <PlayerCard
                player={players[1]}
                isActive={currentPlayer === 1 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && lastPlayerId === 1}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>
          </div>

          {/* 中间游戏区域 */}
          <div className="center-area">
            {/* 顶部电脑玩家 - 顺时针：3 */}
            <div className="top-player">
              <PlayerCard
                player={players[3]}
                isActive={currentPlayer === 3 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && lastPlayerId === 3}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>

            {/* 出牌展示区域 - 每个玩家的出牌在各自位置 */}
            <div className="played-cards-container">
              {[0, 1, 2, 3, 4, 5].map((pid) => {
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
          </div>

          {/* 右侧两个电脑玩家 - 顺时针：4(右上), 5(右下) */}
          <div className="right-players">
            <div className="side-player">
              <PlayerCard
                player={players[4]}
                isActive={currentPlayer === 4 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && lastPlayerId === 4}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>
            <div className="side-player">
              <PlayerCard
                player={players[5]}
                isActive={currentPlayer === 5 && gamePhase === "playing"}
                isLandlord={false}
                isWinner={gamePhase === "end" && lastPlayerId === 5}
                isGameWinner={false}
                showRemainingCards={gamePhase === "end"}
                renderCard={renderCard}
              />
            </div>
          </div>
        </div>

        {/* 底部玩家手牌 - 独立于 game-table，占据全宽 */}
        {gamePhase !== "init" && (
          <div
            className={`player-hand ${currentPlayer === 0 ? "active" : ""} ${
              gamePhase === "end" && lastPlayerId === 0 ? "winner" : ""
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
    </div>
  );
};

export default DaGuaiLuZi;
