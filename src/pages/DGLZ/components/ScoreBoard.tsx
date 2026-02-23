import React from 'react';
import './ScoreBoard.less';

interface ScoreBoardProps {
  scores: number[]; // Total scores
  roundScores: number[] | null; // Scores for the current round (null if viewing history mid-game)
  onClose: () => void;
  onRestart?: () => void;
}

const ScoreBoard: React.FC<ScoreBoardProps> = ({ scores, roundScores, onClose, onRestart }) => {
  const playerNames = [
    "玩家1 (你)",
    "玩家2",
    "玩家3",
    "玩家4",
    "玩家5",
    "玩家6",
  ];

  // Team A: 0, 2, 4
  // Team B: 1, 3, 5
  const getTeam = (idx: number) => idx % 2 === 0 ? 'A' : 'B';

  const renderScore = (score: number, isTotal = false) => {
    const isPositive = score > 0;
    const isNegative = score < 0;
    return (
      <span className={`score-value ${isPositive ? 'positive' : ''} ${isNegative ? 'negative' : ''} ${isTotal ? 'total-score' : ''}`}>
        {score > 0 ? '+' : ''}{score}
      </span>
    );
  };

  return (
    <div className="scoreboard-overlay" onClick={onClose}>
      <div className="scoreboard-content" onClick={e => e.stopPropagation()}>
        <h2 className="scoreboard-title">积分表</h2>
        
        <table className="scoreboard-table">
          <thead>
            <tr>
              <th>项目</th>
              {playerNames.map((name, idx) => (
                <th key={idx}>
                  <div className="player-header">
                    <span>{name}</span>
                    <span className={`team-badge team-${getTeam(idx).toLowerCase()}`}>
                      {getTeam(idx) === 'A' ? '蓝队' : '红队'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roundScores && (
              <tr>
                <td>本局得分</td>
                {roundScores.map((score, idx) => (
                  <td key={idx}>{renderScore(score)}</td>
                ))}
              </tr>
            )}
            <tr>
              <td>总积分</td>
              {scores.map((score, idx) => (
                <td key={idx}>{renderScore(score, true)}</td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="scoreboard-actions">
          <button className="btn btn-primary btn-close" onClick={onClose}>
            关闭
          </button>
          {onRestart && (
            <button className="btn btn-red" onClick={onRestart}>
              下一局 / 重新开始
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScoreBoard;
