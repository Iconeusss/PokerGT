import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home/Home";
import DouDiZhu from "./pages/DDZ/DDZ";
import GuanDanGame from "./pages/GD/GD";
import DaGuaiLuZi from "./pages/DGLZ/DGLZ";
import Home2 from "./pages/Home2/Home2";
import "./App.less";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ddz" element={<DouDiZhu />} />
        <Route path="/gd" element={<GuanDanGame />} />
        <Route path="/dglz" element={<DaGuaiLuZi />} />
        <Route path="/home2" element={<Home2 />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
