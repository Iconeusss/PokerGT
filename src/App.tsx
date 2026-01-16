import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import DouDiZhu from "./pages/DDZ/DDZ";
import GuanDanGame from "./pages/GD/GD";
import DaGuaiLuZi from "./pages/DGLZ/DGLZ";
import "./App.less";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="home-container-poker">
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
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ddz" element={<DouDiZhu />} />
        <Route path="/gd" element={<GuanDanGame />} />
        <Route path="/dglz" element={<DaGuaiLuZi />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
