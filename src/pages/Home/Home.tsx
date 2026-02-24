import { useNavigate } from "react-router-dom";
import "./home.less";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container-poker">
      <div className="user-menu">
        <div className="user-icon">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        </div>
        <div className="user-dropdown">
          <button className="dropdown-item">注册</button>
          <button className="dropdown-item">登录</button>
        </div>
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
      <button className="theme-switch-btn" onClick={() => navigate("/home2")}>
        🖥 Terminal Mode
      </button>
    </div>
  );
}

export default Home;
