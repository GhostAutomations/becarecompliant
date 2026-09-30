"use client";

import { createContext, useContext, useMemo } from "react";
import { branchTerms, type BranchTerms, type BranchWord } from "@/lib/branches/word";

/* The company's word for a branch (0354), set once by the app layout and read by any client
   component with useBranchWord(). Outside the provider it falls back to Branch. */
const BranchWordContext = createContext<BranchWord | null>(null);

export function BranchWordProvider({ word, children }: { word: BranchWord; children: React.ReactNode }) {
  return <BranchWordContext.Provider value={word}>{children}</BranchWordContext.Provider>;
}

export function useBranchWord(): BranchTerms {
  const word = useContext(BranchWordContext);
  return useMemo(() => branchTerms(word), [word]);
}
