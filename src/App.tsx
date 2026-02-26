import { BrowserRouter, Routes, Route } from "react-router-dom";
import GuanDanGame from "./pages/GD/GD";
import DaGuaiLuZi from "./pages/DGLZ/DGLZ";
import { ThemeProvider, ThemedPage } from "./context/ThemeContext";
import "./App.less";

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<ThemedPage page="home" />} />
          <Route path="/ddz" element={<ThemedPage page="ddz" />} />
          <Route path="/gd" element={<GuanDanGame />} />
          <Route path="/dglz" element={<DaGuaiLuZi />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
