import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { THEME_STORAGE_KEY } from "@/lib/constants"

export type Theme = "dark" | "light"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"
}

/**
 * Minimal replacement for next-themes. That package renders an inline
 * anti-flash <script> as part of its React tree - a pattern that only works
 * in frameworks that emit real SSR HTML before hydration. This is a
 * client-only Vite SPA, so React 19 correctly refuses to execute that
 * JSX-rendered <script> (logs "Encountered a script tag while rendering
 * React component" on every single page) and the flash it claimed to
 * prevent was never actually prevented. The real fix - a blocking inline
 * script in index.html's <head>, which runs before React mounts at all -
 * lives there instead; this provider just owns the React-side state after
 * that script has already set the initial class.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.classList.toggle("light", theme === "light")
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>")
  return ctx
}
