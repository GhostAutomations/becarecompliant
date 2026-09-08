"use client";

/**
 * The boundary for every route OUTSIDE the app group: sign in, welcome, pricing, start a
 * trial, the public forms. See components/error-screen.tsx for what it is catching and
 * why the sign in page needed it most.
 */

import ErrorScreen from "@/components/error-screen";

export default function RootError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth-bg flex min-h-screen items-center justify-center">
      <ErrorScreen {...props} />
    </main>
  );
}
