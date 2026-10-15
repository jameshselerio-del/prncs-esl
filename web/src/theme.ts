import { useCallback, useState } from 'react';

/** "system" follows the device setting; light/dark override it. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'theme';

/**
 * The saved choice. index.html, privacy.html and terms.html apply it in <head> before the
 * page paints (same localStorage key), so there is no flash of the wrong theme.
 */
export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setThemeState] = useState<ThemeChoice>(readTheme);
  const setTheme = useCallback((choice: ThemeChoice) => {
    applyTheme(choice);
    setThemeState(choice);
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // Storage unavailable (private mode): the choice still applies until the page reloads.
    }
  }, []);
  return [theme, setTheme];
}
