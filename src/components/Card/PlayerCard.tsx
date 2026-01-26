import React from "react";
import "./PlayerCard.less";

interface Card {
  suit: string;
  rank: string;
  id: string;
  value: number;
  isWild?: boolean;
}

interface Player {
  id: number;
  name: string;
  cards: Card[];
  playCount: number;
  teamId?: number;
  teamScore?: number;
  isLandlord?: boolean;
}

export interface PlayerCardProps {
  player: Player;
  isActive: boolean;
  isLandlord: boolean;
  isWinner: boolean;
  isGameWinner?: boolean;
  showRemainingCards: boolean;
  renderCard: (
    card: Card,
    isSelectable: boolean,
    isSelected: boolean,
    size: string,
    index?: number,
  ) => React.ReactNode;
  className?: string;
  reverseCards?: boolean; 
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isActive,
  isLandlord,
  isWinner,
  isGameWinner,
  showRemainingCards,
  renderCard,
  className = "",
  reverseCards = false,
}) => {
  if (!player) return null;

  const classNames = [
    "player-info",
    isActive ? "active" : "",
    isLandlord ? "landlord" : "",
    isWinner ? "winner" : "",
    isGameWinner ? "game-winner" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const cardsToRender = reverseCards
    ? [...player.cards].reverse()
    : player.cards;

  return (
    <div className={classNames}>
      <h3 className="player-name">{player.name}</h3>
      <p className="player-cards-count">剩余: {player.cards.length} 张</p>
      <p className="player-stats">出牌: {player.playCount || 0}</p>
      {showRemainingCards && player.cards.length > 0 && (
        <div className="remaining-cards">
          {cardsToRender.map((c) => renderCard(c, false, false, "mini"))}
        </div>
      )}
    </div>
  );
};

export default PlayerCard;
