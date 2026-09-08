"use client";

/**
 * The boundary for the signed in app. Shares its screen with the root boundary so the two
 * can never drift into telling a person two different stories about the same failure.
 * See components/error-screen.tsx.
 */

import ErrorScreen from "@/components/error-screen";

export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen {...props} />;
}
