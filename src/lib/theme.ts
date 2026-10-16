/**
 * NatureWatch Theme Management (Light / Dark)
 * Supports localStorage persistence, system preference synchronization,
 * and class-based DOM styling for Tailwind CSS v4.
 */

import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'naturewatch_theme';

/**
 * Resolves the currently active theme:
 * 1. Explicit user selection stored in localStorage
 * 2. Operating system prefers-color-scheme
 * 3. Default fallback to 'light'
 */
export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch (err) {
    console.warn('[Theme] Could not read localStorage:', err);
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

/**
 * Persists theme preference to localStorage.
 */
export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {
    console.warn('[Theme] Could not save to localStorage:', err);
  }
}

/**
 * Applies the given theme to document.documentElement and meta theme-color.
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Update mobile status bar theme-color
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement('meta');
    metaTheme.setAttribute('name', 'theme-color');
    document.head.appendChild(metaTheme);
  }
  metaTheme.setAttribute('content', theme === 'dark' ? '#141517' : '#ffffff');
}

/**
 * Custom React hook for theme consumption and toggling.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Sync with DOM on mount and listen to system preference changes if user hasn't explicitly set preference
  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      const explicit = localStorage.getItem(THEME_STORAGE_KEY);
      if (!explicit) {
        const sysTheme: ThemeMode = e.matches ? 'dark' : 'light';
        setThemeState(sysTheme);
        applyTheme(sysTheme);
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}
