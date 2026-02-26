import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import AuthModal from "../../components/AuthModal/AuthModal";
import "./home.less";

function Home() {
  const navigate = useNavigate();
  const { cycleTheme } = useTheme();
  const [showAuth, setShowAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pokergt_current_user");
    if (saved) setCurrentUser(saved);
  }, []);

  const handleIconClick = () => {
    if (currentUser) {
      localStorage.removeItem("pokergt_current_user");
      setCurrentUser(null);
    } else {
      setShowAuth(true);
    }
  };

  return (
    <div className="home-container-poker">
      <div className="user-btn" onClick={handleIconClick}>
        {currentUser ? (
          <span className="user-avatar-letter">
            {currentUser.charAt(0).toUpperCase()}
          </span>
        ) : (
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        )}
      </div>

      <h1 className="home-title">PokerGT</h1>
      <div className="game-select">
        <button className="game-btn ddz-btn" onClick={() => navigate("/ddz")}>
          斗地主
        </button>
        <button className="game-btn gd-btn" onClick={() => navigate("/gd")}>
          掼蛋
        </button>
        <button className="game-btn dglz-btn" onClick={() => navigate("/dglz")}>
          大怪路子
        </button>
      </div>
      <button className="theme-switch-btn" onClick={cycleTheme}>
        🖥 Terminal Mode
      </button>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onLoginSuccess={(name) => setCurrentUser(name)}
      />
    </div>
  );
}

export default Home;
