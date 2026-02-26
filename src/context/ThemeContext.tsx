import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  Suspense,
} from "react";

// --------------- Theme Registry ---------------
// To add a new theme, simply add an entry here. Everything else adapts automatically.

const THEME_REGISTRY: Record<
  string,
  Record<string, React.LazyExoticComponent<React.ComponentType>>
> = {
  home: {
    classic: React.lazy(() => import("../pages/Home/Home")),
    terminal: React.lazy(() => import("../pages/Home2/Home2")),
    // future: cyberpunk: React.lazy(() => import("../pages/Home3/Home3")),
  },
  ddz: {
    classic: React.lazy(() => import("../pages/DDZ/DDZ")),
    terminal: React.lazy(() => import("../pages/DDZ2/DDZ2")),
  },
};

// Derive available theme names from the first page entry (all pages share the same set)
const AVAILABLE_THEMES = Object.keys(Object.values(THEME_REGISTRY)[0]);
const DEFAULT_THEME = AVAILABLE_THEMES[0]; // "classic"
const STORAGE_KEY = "pokergt_theme";

// --------------- Context ---------------

interface ThemeContextType {
  theme: string;
  setTheme: (t: string) => void;
  availableThemes: string[];
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && AVAILABLE_THEMES.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return DEFAULT_THEME;
  });

  const setTheme = useCallback((t: string) => {
    if (AVAILABLE_THEMES.includes(t)) {
      setThemeState(t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        // ignore
      }
    }
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const idx = AVAILABLE_THEMES.indexOf(prev);
      const next = AVAILABLE_THEMES[(idx + 1) % AVAILABLE_THEMES.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, availableThemes: AVAILABLE_THEMES, cycleTheme }),
    [theme, setTheme, cycleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// --------------- ThemedPage ---------------
// Renders the correct component for a given page based on the current theme.

export function ThemedPage({ page }: { page: string }) {
  const { theme } = useTheme();
  const pageMap = THEME_REGISTRY[page];
  if (!pageMap) throw new Error(`Unknown page "${page}" in THEME_REGISTRY`);

  const Component = pageMap[theme] || pageMap[DEFAULT_THEME];

  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            color: "#888",
          }}
        >
          Loading…
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
