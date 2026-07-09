/**
 * Shared server-action result shape for useActionState forms.
 * redirectTo: when set, the client navigates there with router.replace after the
 * action resolves. We do NOT call next/navigation redirect() inside these actions:
 * redirecting to a URL with a query string from a Server Action trips a known
 * Next.js 15 App Router bug (issue #78396 / React #310, "Rendered more hooks than
 * during the previous render") in the router's searchParams useMemo. Client-side
 * navigation avoids that transition entirely.
 */
export type ActionState = { ok?: string; error?: string; redirectTo?: string };

export const IDLE_STATE: ActionState = {};
