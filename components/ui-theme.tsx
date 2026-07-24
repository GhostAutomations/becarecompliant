"use client";

import { createContext, useContext } from "react";

/**
 * Per-company UI theme, provided from the app layout (reads companies.ui_theme).
 * 'classic' = the standard navy/gold look. 'board_dark' = the Monday-style board
 * build (structural variants live behind useIsBoard(), the paint lives in the
 * scoped .theme-board block in globals.css). Reusable by any client component.
 */
const UiThemeContext = createContext<string>("classic");

export function UiThemeProvider({
  theme,
  children,
}: {
  theme: string;
  children: React.ReactNode;
}) {
  return <UiThemeContext.Provider value={theme}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme(): string {
  return useContext(UiThemeContext);
}

/** True when the company is on the Monday board theme. */
export function useIsBoard(): boolean {
  return useContext(UiThemeContext) === "board_dark";
}
