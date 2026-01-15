import React, { useState, useEffect } from "react";
import "./DDZ.less";

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
  isLandlord: boolean;
  playCount: number;
}
interface CardType {
  type: string;
  value: number;
  count: number;
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

// --- 工具函数 ---
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

// --- 牌型校验逻辑 ---
const getCardType = (cards: Card[]): CardType | null => {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const values = sorted.map((c) => c.value);
  const len = cards.length;

  if (len === 2 && values[0] === 16 && values[1] === 17)
    return { type: "rocket", value: 100, count: 2 };

  const counts: { [key: number]: number } = {};
  values.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const freq = Object.entries(counts)
    .map(([v, c]) => ({ val: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  if (len === 4 && freq[0].count === 4)
    return { type: "bomb", value: freq[0].val, count: 4 };
  if (len === 1) return { type: "single", value: values[0], count: 1 };
  if (len === 2 && values[0] === values[1])
    return { type: "pair", value: values[0], count: 2 };
  if (len === 3 && freq[0].count === 3)
    return { type: "triple", value: freq[0].val, count: 3 };

  if (freq[0].count === 3) {
    if (len === 4)
      return { type: "triple_single", value: freq[0].val, count: 4 };
    if (len === 5 && freq[1]?.count === 2)
      return { type: "triple_pair", value: freq[0].val, count: 5 };
  }

  // 顺子
  if (len >= 5 && freq.every((f) => f.count === 1) && values[len - 1] < 15) {
    if (values[len - 1] - values[0] === len - 1)
      return { type: "straight", value: values[len - 1], count: len };
  }

  // 连对 (姐妹对)
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

  // 飞机系列
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
  const played = getCardType(playedCards);
  const last = getCardType(lastCards);
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

// --- AI 核心搜索逻辑 ---
const findSmartAICards = (
  hand: Card[],
  lastCards: Card[],
  opponentCount: number
): Card[] | null => {
  const lastType = lastCards.length > 0 ? getCardType(lastCards) : null;
  const analysis: { [key: number]: Card[] } = {};
  hand.forEach((c) => {
    if (!analysis[c.value]) analysis[c.value] = [];
    analysis[c.value].push(c);
  });
  const values = Object.keys(analysis)
    .map(Number)
    .sort((a, b) => a - b);

  const findSafe = (min: number, req: number) =>
    values.find((v) => v > min && analysis[v].length === req && v < 15) ||
    values.find(
      (v) =>
        v > min && analysis[v].length > req && analysis[v].length < 4 && v < 15
    );

  if (!lastType) {
    // AI 主动出牌
    const t = values.find((v) => analysis[v].length === 3);
    if (t) {
      const wing = values.find((v) => v !== t && analysis[v].length === 1);
      return wing ? [...analysis[t], analysis[wing][0]] : analysis[t];
    }
    const p = values.find((v) => analysis[v].length === 2);
    return p ? analysis[p] : [hand[0]];
  }

  // AI 压牌逻辑
  let res: Card[] | null = null;
  if (lastType.type === "single") {
    const v =
      opponentCount <= 2
        ? values[values.length - 1]
        : findSafe(lastType.value, 1);
    if (v && v > lastType.value) res = [analysis[v][0]];
  } else if (lastType.type === "pair") {
    const v = findSafe(lastType.value, 2);
    if (v) res = analysis[v].slice(0, 2);
  } else if (lastType.type === "straight") {
    for (let i = 0; i <= values.length - lastType.count; i++) {
      let seq: Card[] = [];
      for (let j = 0; j < lastType.count; j++) {
        const val = values[i] + j;
        if (
          analysis[val] &&
          val > lastType.value - lastType.count + 1 &&
          val < 15
        )
          seq.push(analysis[val][0]);
      }
      if (seq.length === lastType.count) {
        res = seq;
        break;
      }
    }
  }

  // 兜底炸弹
  if (!res) {
    const b = values.find(
      (v) =>
        analysis[v].length === 4 &&
        (lastType.type !== "bomb" || v > lastType.value)
    );
    if (b) res = analysis[b];
  }
  return res;
};

const DouDiZhuGame: React.FC = () => {
  // --- 原有状态保持不变 ---
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

  // --- 游戏流程 ---
  const startGame = () => {
    const deck = shuffleDeck(createDeck());
    const newPlayers: Player[] = [
      {
        id: 0,
        name: "玩家1 (你)",
        cards: deck.slice(0, 17).sort((a, b) => a.value - b.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 1,
        name: "玩家2",
        cards: deck.slice(17, 34).sort((a, b) => a.value - b.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 2,
        name: "玩家3",
        cards: deck.slice(34, 51).sort((a, b) => a.value - b.value),
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
    setMessage("叫地主阶段！玩家1先选择是否叫地主");
  };

  const callLandlord = (call: boolean) => {
    if (call) {
      const newPlayers = [...players];
      newPlayers[currentPlayer].isLandlord = true;
      newPlayers[currentPlayer].cards = [
        ...newPlayers[currentPlayer].cards,
        ...baseCards,
      ].sort((a, b) => a.value - b.value);
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

  // --- 核心动作封装 ---
  const handlePlay = (playerId: number, cardsToPlay: Card[]) => {
    // const type = getCardType(cardsToPlay);
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
    if (!getCardType(selected)) return setMessage("无效牌型");
    if (!canBeat(selected, lastPlayedCards)) return setMessage("压不过上家");
    handlePlay(0, selected);
  };

  // --- AI 监听器 ---
  useEffect(() => {
    if (gamePhase === "bidding" && currentPlayer !== 0) {
      const timer = setTimeout(() => callLandlord(Math.random() > 0.6), 1200);
      return () => clearTimeout(timer);
    }
    if (gamePhase === "playing" && currentPlayer !== 0) {
      const timer = setTimeout(() => {
        const aiCards = findSmartAICards(
          players[currentPlayer].cards,
          lastPlayedCards,
          players[0].cards.length
        );
        if (aiCards) handlePlay(currentPlayer, aiCards);
        else handlePass(currentPlayer);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [gamePhase, currentPlayer, lastPlayedCards]);

  // --- UI 渲染函数 (保持原有 HTML 结构) ---
  const renderCard = (
    card: Card,
    isSelectable = false,
    isSelected = false,
    size = "normal"
  ) => {
    const isRed =
      card.suit === "♥" || card.suit === "♦" || card.rank === "JOKER";
    const isJoker = card.rank === "joker" || card.rank === "JOKER";
    return (
      <div
        key={card.id}
        onClick={() =>
          isSelectable &&
          setSelectedCards((prev) =>
            prev.includes(card.id)
              ? prev.filter((id) => id !== card.id)
              : [...prev, card.id]
          )
        }
        className={`card ${size} ${isJoker ? "joker-card" : ""} ${
          isRed ? "red" : "black"
        } ${isSelected ? "selected" : ""} ${isSelectable ? "selectable" : ""}`}
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
    <div className="game-container">
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
                <strong>胜负判定：</strong>地主跑光手牌获胜，否则农民获胜。
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
        <div className={`button-group ${gamePhase !== 'init' ? 'top-right' : ''}`}>
          <button onClick={startGame} className="btn btn-primary">
            {gamePhase === "init" ? "开始游戏" : "重新开始"}
          </button>
        </div>

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
                } ${players[1].isLandlord ? "landlord" : ""}`}
              >
                <h3 className="player-name">{players[1].name}</h3>
                <p className="player-cards-count">
                  剩余: {players[1].cards.length} 张
                </p>
                <p className="player-stats">
                  出牌: {players[1].playCount || 0}
                </p>
              </div>
            )}
          </div>
          <div className="center-area">
            <div className="table-area">
              <h3 className="table-title">
                当前牌面{" "}
                <span className="game-stats-inline">
                  轮次: {Math.floor(totalTurns / 3) + 1}
                </span>
              </h3>
              {lastPlayedCards.length > 0 ? (
                <div>
                  <p className="table-info">
                    {players[lastPlayerId]?.name} 出的牌
                  </p>
                  <div className="table-cards">
                    {lastPlayedCards.map((c) =>
                      renderCard(c, false, false, "normal")
                    )}
                  </div>
                </div>
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
                } ${players[2].isLandlord ? "landlord" : ""}`}
              >
                <h3 className="player-name">{players[2].name}</h3>
                <p className="player-cards-count">
                  剩余: {players[2].cards.length} 张
                </p>
                <p className="player-stats">
                  出牌: {players[2].playCount || 0}
                </p>
              </div>
            )}
          </div>
        </div>

        {(gamePhase === "playing" || gamePhase === "bidding") && (
          <div
            className={`player-hand ${
              players[0].isLandlord ? "landlord" : ""
            } ${currentPlayer === 0 ? "active" : ""}`}
          >
            <div className="hand-header">
              <h3 className="hand-title">
                你的手牌 ({players[0].cards.length}张){" "}
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

            <div className="hand-cards-scroll-container">
              <div className="hand-cards">
                {players[0].cards.map((c) =>
                  renderCard(c, true, selectedCards.includes(c.id), "normal")
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DouDiZhuGame;
