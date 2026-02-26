import { useState, useEffect, useCallback } from "react";
import "./authModal.less";

interface AuthModalProps {
  open: boolean;
  defaultMode?: Mode;
  onClose: () => void;
  onLoginSuccess: (username: string) => void;
}

type Mode = "login" | "register";

interface StoredUser {
  username: string;
  password: string;
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem("pokergt_users") || "[]");
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem("pokergt_users", JSON.stringify(users));
}

function AuthModal({
  open,
  defaultMode = "login",
  onClose,
  onLoginSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(defaultMode);

  // sync mode when defaultMode prop changes
  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState<"horizontal" | "vertical" | false>(false);

  // reset form when modal opens/closes or mode changes
  useEffect(() => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setShake(false);
  }, [open, mode]);

  // ESC to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const triggerError = (msg: string, isVertical = false) => {
    setError(msg);
    setShake(isVertical ? "vertical" : "horizontal");
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();

    if (!trimmed) {
      triggerError("请输入用户名");
      return;
    }
    if (!password) {
      triggerError("请输入密码");
      return;
    }
    if (password.length < 4) {
      triggerError("密码至少4位");
      return;
    }

    const users = getUsers();

    if (mode === "register") {
      if (password !== confirmPassword) {
        triggerError("两次密码不一致");
        return;
      }
      if (users.find((u) => u.username === trimmed)) {
        triggerError("用户名已存在");
        return;
      }
      users.push({ username: trimmed, password });
      saveUsers(users);
      localStorage.setItem("pokergt_current_user", trimmed);
      onLoginSuccess(trimmed);
      onClose();
    } else {
      const found = users.find(
        (u) => u.username === trimmed && u.password === password,
      );
      if (!found) {
        triggerError("用户名或密码错误", true);
        return;
      }
      localStorage.setItem("pokergt_current_user", trimmed);
      onLoginSuccess(trimmed);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal-wrapper" onClick={(e) => e.stopPropagation()}>
        <div
          className={`auth-modal${
            shake === "horizontal"
              ? " auth-shake"
              : shake === "vertical"
                ? " auth-shake-vertical"
                : ""
          }`}
        >
          {/* close btn */}
          <button className="auth-close" onClick={onClose}>
            ✕
          </button>

          {/* header / tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab${mode === "login" ? " active" : ""}`}
              onClick={() => setMode("login")}
            >
              登录
            </button>
            <button
              className={`auth-tab${mode === "register" ? " active" : ""}`}
              onClick={() => setMode("register")}
            >
              注册
            </button>
          </div>

          {/* form */}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label">用户名</label>
              <input
                className="auth-input"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">密码</label>
              <input
                className="auth-input"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {mode === "register" && (
              <div className="auth-field">
                <label className="auth-label">确认密码</label>
                <input
                  className="auth-input"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit">
              {mode === "login" ? "登 录" : "注 册"}
            </button>
          </form>

          <p className="auth-hint">
            {mode === "login" ? "没有账号？" : "已有账号？"}
            <span
              className="auth-switch"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "立即注册" : "去登录"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
