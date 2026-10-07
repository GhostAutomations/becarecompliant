"use client";

/**
 * The live update channel for whatever company the signed in person is working in (speed plan
 * push 2). Set once by the app layout: "company:<id>" for anybody in a company, including the
 * founder managing as one, and "founder" for the founder otherwise. Read by the live refresh
 * components so none of the pages that use them has to pass it in.
 */

import { createContext, useContext, type ReactNode } from "react";

const LiveTopicContext = createContext<string | null>(null);

export function LiveTopicProvider({ topic, children }: { topic: string | null; children: ReactNode }) {
  return <LiveTopicContext.Provider value={topic}>{children}</LiveTopicContext.Provider>;
}

export function useLiveTopic(): string | null {
  return useContext(LiveTopicContext);
}
