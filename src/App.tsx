import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import DouDiZhuGame from './pages/DDZ/DDZ'
import GuanDanGame from './pages/GD/GD'
import './App.css'

function Home() {
  const navigate = useNavigate()

  return (
    <div className="home-container-poker">
      <h1 className="home-title">PokerGT</h1>
      <div className="game-select">
        <button className="game-btn ddz-btn" onClick={() => navigate('/ddz')}>
          斗地主
        </button>
        <button className="game-btn gd-btn" onClick={() => navigate('/gd')}>
          掼蛋
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ddz" element={<DouDiZhuGame />} />
        <Route path="/gd" element={<GuanDanGame />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
