import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./DDZ2.less";
import { evaluateLandlordHand, playsByAI } from "../DDZ/ai/ddzAI";
import PlayerCard from "../../components/Card/PlayerCard";

// Base interface and constants
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

const SIGNALS = ["STRONG", "GOOD", "FAIR", "WEAK", "STRONG", "GOOD"] as const;
const ENCRYPTIONS = [
  "AES-256",
  "AES-128",
  "RSA-4096",
  "ChaCha20",
  "AES-256-GCM",
] as const;
const NODES = [
  "US-E-04",
  "US-W-12",
  "EU-C-07",
  "AP-S-03",
  "US-E-11",
  "EU-N-02",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

// Card type validation
const getDDZType = (cards: Card[]): CardType | null => {
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

  if (len >= 5 && freq.every((f) => f.count === 1) && values[len - 1] < 15) {
    if (values[len - 1] - values[0] === len - 1)
      return { type: "straight", value: values[len - 1], count: len };
  }

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
        if (len === consecutiveCount * 3)
          return { type: "plane", value: maxTrioVal, count: len };
        if (len === consecutiveCount * 4)
          return { type: "plane_with_singles", value: maxTrioVal, count: len };
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
          if (Object.values(remCounts).every((c) => c % 2 === 0)) {
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

const DDZ2: React.FC = () => {
  const navigate = useNavigate();

  // CRT status
  const [status, setStatus] = useState<{
    signal: (typeof SIGNALS)[number];
    enc: (typeof ENCRYPTIONS)[number];
    node: (typeof NODES)[number];
  }>({ signal: SIGNALS[0], enc: ENCRYPTIONS[0], node: NODES[0] });
  useEffect(() => {
    const timer = setInterval(
      () =>
        setStatus({
          signal: pick(SIGNALS),
          enc: pick(ENCRYPTIONS),
          node: pick(NODES),
        }),
      300000,
    );
    return () => clearInterval(timer);
  }, []);

  // Rotary knob simulation
  const [knobAngle, setKnobAngle] = useState(90);
  const knobRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startAngle = useRef(0);
  const startKnob = useRef(0);
  const scanlineIntensity = 0.05 + (knobAngle / 270) * 0.95;

  const getPointerAngle = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      const el = knobRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    },
    [],
  );

  const onPointerDownKnob = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
      startAngle.current = getPointerAngle(e);
      startKnob.current = knobAngle;
    },
    [getPointerAngle, knobAngle],
  );

  const onPointerMoveKnob = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const current = getPointerAngle(e);
      let delta = current - startAngle.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      setKnobAngle(Math.min(270, Math.max(0, startKnob.current + delta)));
    },
    [getPointerAngle],
  );

  // Game state
  const [players, setPlayers] = useState<Player[]>([
    { id: 0, name: "YOU", cards: [], isLandlord: false, playCount: 0 },
    { id: 1, name: "CPU 1", cards: [], isLandlord: false, playCount: 0 },
    { id: 2, name: "CPU 2", cards: [], isLandlord: false, playCount: 0 },
  ]);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [lastPlayerId, setLastPlayerId] = useState(-1);
  const [lastPlayedCards, setLastPlayedCards] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [gamePhase, setGamePhase] = useState<
    "init" | "bidding" | "playing" | "end"
  >("init");
  const [message, setMessage] = useState("准备开始");
  const [passCount, setPassCount] = useState(0);
  const [totalTurns, setTotalTurns] = useState(0);
  const [sortOrder] = useState<"asc" | "desc">("desc");

  const myCards = players[0].cards;

  const startGame = () => {
    const deck = shuffleDeck(createDeck());
    setPlayers([
      {
        id: 0,
        name: "YOU",
        cards: deck.slice(0, 17).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 1,
        name: "CPU 1",
        cards: deck.slice(17, 34).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
      {
        id: 2,
        name: "CPU 2",
        cards: deck.slice(34, 51).sort((a, b) => b.value - a.value),
        isLandlord: false,
        playCount: 0,
      },
    ]);
    setBaseCards(deck.slice(51, 54));
    setLastPlayedCards([]);
    setSelectedCards([]);
    setLastPlayerId(-1);
    setCurrentPlayer(0);
    setGamePhase("bidding");
    setPassCount(0);
    setTotalTurns(0);
    setMessage("请选择是否叫地主");
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
      setGamePhase("playing");
      setMessage(`${newPlayers[currentPlayer].name} 成为地主`);
    } else {
      const nextPlayer = (currentPlayer + 1) % 3;
      if (totalTurns >= 2) {
        startGame();
        return;
      } // Simplified: if nobody calls, restart
      setCurrentPlayer(nextPlayer);
      setTotalTurns((prev) => prev + 1);
      setMessage(`等待 ${players[nextPlayer].name} 操作`);
    }
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
    setTotalTurns((prev) => prev + 1);
    if (newPlayers[playerId].cards.length === 0) {
      setMessage(
        `游戏结束：${newPlayers[playerId].isLandlord ? "地主" : "农民"} 获胜`,
      );
      setGamePhase("end");
      return;
    }
    const nextPlayer = (playerId + 1) % 3;
    setCurrentPlayer(nextPlayer);
    setMessage(
      `${players[playerId].name} 已出牌，等待 ${players[nextPlayer].name}`,
    );
  };

  const handlePass = (playerId: number) => {
    const newPassCount = passCount + 1;
    setPassCount(newPassCount);
    const nextPlayer = (playerId + 1) % 3;
    setCurrentPlayer(nextPlayer);
    if (newPassCount >= 2) {
      setLastPlayedCards([]);
      setPassCount(0);
      setMessage(`${players[nextPlayer].name} 获得出牌权`);
    } else {
      setMessage(`${players[playerId].name} 不出`);
    }
  };

  const playCards = () => {
    const selected = players[0].cards.filter((card) =>
      selectedCards.includes(card.id),
    );
    if (!getDDZType(selected)) return setMessage("无效的牌型");
    if (!canBeat(selected, lastPlayedCards)) return setMessage("管不上");
    handlePlay(0, selected);
  };

  useEffect(() => {
    if (gamePhase === "bidding" && currentPlayer !== 0) {
      const timer = setTimeout(() => {
        const hand = players[currentPlayer].cards;
        const score = evaluateLandlordHand(hand);
        callLandlord(score >= 25);
      }, 1500);
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
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gamePhase, currentPlayer, lastPlayedCards]);

  const toggleCardSelection = (id: string) => {
    setSelectedCards((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const renderCard = (
    card: Card,
    isSelectable = false,
    isSelected = false,
    size = "normal",
  ) => {
    const isRed =
      card.suit === "♥" || card.suit === "♦" || card.rank === "JOKER";
    const isJoker = card.rank === "joker" || card.rank === "JOKER";
    return (
      <div
        key={card.id}
        onClick={() => isSelectable && toggleCardSelection(card.id)}
        className={`card ${size} ${isRed ? "red" : "black"} ${isSelected ? "selected" : ""} ${isSelectable ? "selectable" : ""}`}
      >
        <div className="card-top-left">
          <div className="card-rank">{isJoker ? "Joker" : card.rank}</div>
          <div className="card-suit">{card.suit}</div>
        </div>
        <div className="card-bottom-right">
          <div className="card-rank">{isJoker ? "Joker" : card.rank}</div>
          <div className="card-suit">{card.suit}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="ddz2-page">
      {/* noise overlay */}
      <div className="noise-overlay" />

      {/* outer case */}
      <div className="case-outer">
        {/* vent strip */}
        <div className="vent-strip">
          <div className="vent-slot" />
          <div className="vent-slot" />
          <div className="vent-slot" />
          <div className="vent-slot" />
          <div className="vent-slot" />
          <div className="vent-slot" />
        </div>

        {/* inner panel */}
        <div className="case-inner">
          <div className="texture-overlay" />

          {/* ========== Left sidebar ========== */}
          <div className="sidebar-left">
            {/* status box */}
            <div className="status-box">
              <div className="status-header">
                <div className="status-led" />
                <span className="status-label">ONLINE</span>
              </div>
              <div className="status-divider" />
              <div className="status-details">
                Signal: {status.signal}
                <br />
                Enc: {status.enc}
                <br />
                Node: {status.node}
              </div>
            </div>

            {/* opacity knob */}
            <div className="frequency-section">
              <span className="section-label">Signal</span>
              <div className="rotary-container">
                <div className="tick-marks">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <span
                      key={deg}
                      style={{ transform: `rotate(${deg}deg)` }}
                    />
                  ))}
                </div>
                <div
                  className="rotary-knob"
                  ref={knobRef}
                  style={{ transform: `rotate(${knobAngle}deg)` }}
                  onPointerDown={onPointerDownKnob}
                  onPointerMove={onPointerMoveKnob}
                  onPointerUp={() => (dragging.current = false)}
                />
              </div>
            </div>

            {/* power */}
            <div className="power-section">
              <span className="section-label">Master Power</span>
              <div className="toggle-switch">
                <div className="toggle-lever" />
              </div>
              <span className="auth-label">Authorized Only</span>
            </div>
          </div>

          {/* ========== CRT screen ========== */}
          <div className="crt-container">
            <div className="screen-curve" />
            <div
              className="crt-overlay"
              style={{ opacity: scanlineIntensity }}
            />
            <div className="crt-vignette" />

            <div className="crt-screen">
              {/* main - game */}
              <main className="screen-main">
                <div className="game-container-inner">
                  <div className="message-box">
                    <p className="message-text">{message}</p>
                  </div>
                  {gamePhase === "end" && (
                    <div
                      className="button-group"
                      style={{ justifyContent: "center", margin: "6px 0" }}
                    >
                      <button onClick={startGame} className="btn btn-blue">
                        重新开始
                      </button>
                    </div>
                  )}

                  {gamePhase === "init" ? (
                    <div
                      className="button-group"
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        display: "flex",
                      }}
                    >
                      <button onClick={startGame} className="btn btn-blue">
                        开始游戏
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* 底牌 */}
                      <div className="base-cards-section">
                        <div className="base-cards-panel">
                          <h3 className="panel-title">底牌</h3>
                          <div className="base-cards-container">
                            {lastPlayerId === -1
                              ? [1, 2, 3].map((i) => (
                                  <div key={i} className="card-placeholder" />
                                ))
                              : baseCards.map((c) =>
                                  renderCard(c, false, false, "normal"),
                                )}
                          </div>
                        </div>
                      </div>

                      {/* 游戏区: 左玩家 | 出牌区 | 右玩家 */}
                      <div className="game-area">
                        <div className="side-player left">
                          {players[1] && (
                            <PlayerCard
                              player={players[1]}
                              isActive={
                                currentPlayer === 1 &&
                                (gamePhase === "playing" ||
                                  gamePhase === "bidding")
                              }
                              isLandlord={players[1].isLandlord}
                              isWinner={
                                gamePhase === "end" &&
                                (players[1].isLandlord
                                  ? players[lastPlayerId]?.isLandlord
                                  : !players[lastPlayerId]?.isLandlord)
                              }
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
                              <span className="game-stats-inline">
                                轮次: {Math.floor(totalTurns / 3) + 1}
                              </span>
                            </h3>
                            {lastPlayedCards.length > 0 ? (
                              <>
                                <p className="table-info">
                                  {players[lastPlayerId]?.name} 出的牌
                                </p>
                                <div className="table-cards">
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
                                (gamePhase === "playing" ||
                                  gamePhase === "bidding")
                              }
                              isLandlord={players[2].isLandlord}
                              isWinner={
                                gamePhase === "end" &&
                                (players[2].isLandlord
                                  ? players[lastPlayerId]?.isLandlord
                                  : !players[lastPlayerId]?.isLandlord)
                              }
                              isGameWinner={false}
                              showRemainingCards={gamePhase === "end"}
                              renderCard={renderCard}
                              reverseCards
                            />
                          )}
                        </div>
                      </div>

                      {/* 玩家手牌 */}
                      <div
                        className={`player-hand ${players[0].isLandlord ? "landlord" : ""} ${currentPlayer === 0 ? "active" : ""} ${gamePhase === "end" && (players[0].isLandlord ? players[lastPlayerId]?.isLandlord : !players[lastPlayerId]?.isLandlord) ? "winner" : ""}`}
                      >
                        <div className="hand-header">
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
                                className="btn"
                              >
                                不叫
                              </button>
                              <button
                                onClick={() => callLandlord(true)}
                                className="btn"
                                style={{
                                  borderColor: "#fbbf24",
                                  color: "#fbbf24",
                                }}
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
                                className="btn"
                              >
                                不出
                              </button>
                              <button
                                onClick={playCards}
                                disabled={selectedCards.length === 0}
                                className="btn btn-green"
                              >
                                出牌 ({selectedCards.length})
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="hand-cards">
                          {players[0].cards.map((card) =>
                            renderCard(
                              card,
                              gamePhase === "playing" ||
                                gamePhase === "bidding",
                              selectedCards.includes(card.id),
                              "normal",
                            ),
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </main>

              {/* footer */}
              <footer className="screen-footer">
                <div className="footer-stats">
                  <div className="stat-group">
                    <span className="stat-label">Quota</span>
                    <span className="stat-value">82%</span>
                  </div>
                  <div className="stat-group">
                    <span className="stat-label">Cycle</span>
                    <span className="stat-value">
                      {Math.floor(totalTurns / 3) + 1}
                    </span>
                  </div>
                </div>
                <div className="footer-session">
                  <button
                    className="footer-terminate"
                    onClick={() => navigate("/home2")}
                  >
                    ▸ TERMINATE
                  </button>
                </div>
              </footer>
            </div>
          </div>

          {/* ========== Right sidebar ========== */}
          <div className="sidebar-right">
            <div className="keycard-section">
              <div className="keycard-led" />
              <div className="keycard-slot">
                <div className="keycard-slit" />
              </div>
              <span className="keycard-label">Keycard</span>
            </div>

            <button
              className="theme-switch-crt"
              onClick={() => navigate("/home2")}
            >
              ▸ MENU
            </button>

            <div className="sidebar-grooves">
              <div className="groove" />
              <div className="groove" />
              <div className="groove" />
              <div className="groove" />
              <div className="groove" />
            </div>
          </div>
        </div>

        {/* bottom badge */}
        <div className="bottom-badge">Property of LuZi TiYu</div>
      </div>
    </div>
  );
};

export default DDZ2;
