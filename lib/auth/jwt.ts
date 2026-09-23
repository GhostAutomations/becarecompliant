/** Decodes the Supabase session_id claim from an access token. */
export function decodeSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { session_id?: string };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

/**
 * How this session was signed in: the JWT's amr claim, e.g. [{ method: "recovery", timestamp }].
 *
 * Only ever read AFTER supabase.auth.getUser() has accepted the same token, because that call is
 * what checks the signature; this just reads what the checked token says.
 */
export function decodeAmr(accessToken: string): Array<{ method: string; timestamp: number }> {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { amr?: Array<{ method?: unknown; timestamp?: unknown }> };
    return (payload.amr ?? [])
      .filter((a) => typeof a.method === "string" && typeof a.timestamp === "number")
      .map((a) => ({ method: a.method as string, timestamp: a.timestamp as number }));
  } catch {
    return [];
  }
}
