import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./home2.less";

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

function Home2() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<{
    signal: (typeof SIGNALS)[number];
    enc: (typeof ENCRYPTIONS)[number];
    node: (typeof NODES)[number];
  }>({
    signal: SIGNALS[0],
    enc: ENCRYPTIONS[0],
    node: NODES[0],
  });

  // -------- rotary knob → scanline intensity --------
  const [knobAngle, setKnobAngle] = useState(90); // 0-270°, default 90° (right)
  const knobRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startAngle = useRef(0);
  const startKnob = useRef(0);

  // map angle (0-270) → scanline opacity (0.05 - 1.0)
  const scanlineIntensity = 0.05 + (knobAngle / 270) * 0.95;

  const getPointerAngle = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const el = knobRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = true;
      startAngle.current = getPointerAngle(e);
      startKnob.current = knobAngle;
    },
    [getPointerAngle, knobAngle],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const current = getPointerAngle(e);
      let delta = current - startAngle.current;
      // normalise to -180..180
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const next = Math.min(270, Math.max(0, startKnob.current + delta));
      setKnobAngle(next);
    },
    [getPointerAngle],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus({
        signal: pick(SIGNALS),
        enc: pick(ENCRYPTIONS),
        node: pick(NODES),
      });
    }, 300000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="home2-page">
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
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
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
              {/* header */}
              <header className="screen-header">
                <div className="screen-brand">
                  <h2 className="screen-brand-title">PokerGT</h2>
                  <span className="screen-brand-sub">
                    Macrodata Refinement Division
                  </span>
                </div>
                <div className="screen-term-info">
                  TERM_ID: 0492
                  <br />
                  OS: MDR_v9.2
                </div>
              </header>

              {/* main */}
              <main className="screen-main">
                <div className="protocol-heading">
                  <h1 className="protocol-title">Select Mode</h1>
                  <p className="protocol-subtitle">
                    Please refrain from non-work related activities.
                  </p>
                </div>

                {/* card grid */}
                <div className="card-grid">
                  {/* 斗地主 */}
                  <div
                    className="card-group card-group-green"
                    onClick={() => navigate("/ddz2")}
                  >
                    <div className="card-wrapper">
                      <div className="card-shadow" />
                      <button className="card-keycap">
                        <span className="card-suit-icon top-left suit-green suit-glow">
                          <span className="material-symbols-outlined">
                            playing_cards
                          </span>
                        </span>
                        <span className="card-suit-icon bottom-right suit-green suit-glow">
                          <span className="material-symbols-outlined">
                            playing_cards
                          </span>
                        </span>
                        <span className="card-label">斗地主</span>
                      </button>
                    </div>
                    <div className="card-accent">
                      <div className="accent-bar bar-green" />
                      <span className="card-name">Dou DiZhu</span>
                    </div>
                  </div>

                  {/* 掼蛋 */}
                  <div
                    className="card-group card-group-red"
                    onClick={() => navigate("/gd")}
                  >
                    <div className="card-wrapper">
                      <div className="card-shadow" />
                      <button className="card-keycap">
                        <span className="card-suit-icon top-left suit-red suit-glow">
                          <span className="material-symbols-outlined">
                            favorite
                          </span>
                        </span>
                        <span className="card-suit-icon bottom-right suit-red suit-glow">
                          <span className="material-symbols-outlined">
                            favorite
                          </span>
                        </span>
                        <span className="card-label">掼蛋</span>
                      </button>
                    </div>
                    <div className="card-accent">
                      <div className="accent-bar bar-red" />
                      <span className="card-name">Guan Dan</span>
                    </div>
                  </div>

                  {/* 大怪路子 */}
                  <div
                    className="card-group card-group-blue"
                    onClick={() => navigate("/dglz")}
                  >
                    <div className="card-wrapper">
                      <div className="card-shadow" />
                      <button className="card-keycap">
                        <span className="card-suit-icon top-left suit-blue suit-glow">
                          <span className="material-symbols-outlined">
                            diamond
                          </span>
                        </span>
                        <span className="card-suit-icon bottom-right suit-blue suit-glow">
                          <span className="material-symbols-outlined">
                            diamond
                          </span>
                        </span>
                        <span className="card-label">大怪路子</span>
                      </button>
                    </div>
                    <div className="card-accent">
                      <div className="accent-bar bar-blue" />
                      <span className="card-name">DaGuai LuZi</span>
                    </div>
                  </div>
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
                    <span className="stat-label">Efficiency</span>
                    <span className="stat-value">94.5%</span>
                  </div>
                </div>
                <div className="footer-session">
                  <span className="stat-label">Session Time</span>
                  <span className="stat-value">08:00</span>
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

            <button className="theme-switch-crt" onClick={() => navigate("/")}>
              ▸ CLASSIC
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
}

export default Home2;
