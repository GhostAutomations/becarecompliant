"use client";

/**
 * Remember the branch a register is on, for this sign in (migration 0385, Phil 2026-10-05).
 *
 * Saves whenever the branch changes. The first render is skipped, because the page chose that
 * branch FROM the memory (or the primary branch) and writing it straight back is a wasted round
 * trip; the one exception is a branch named in the link, which becomes the remembered one.
 * People and Training use "" (or "all") for All branches, saved as "all".
 */

import { useEffect, useRef } from "react";
import { rememberRegisterBranch } from "@/lib/register/branch-memory-actions";
import type { RegisterScreen } from "@/lib/register/branch-memory-screens";

export function useRememberBranch(screen: RegisterScreen, branch: string, fromLink = false): void {
  const first = useRef(true);
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (isFirst && !fromLink) return;
    const value = branch === "" || branch === "all" ? "all" : branch;
    if (screen === "service_users" && value === "all") return;
    void rememberRegisterBranch(screen, value);
  }, [screen, branch, fromLink]);
}
