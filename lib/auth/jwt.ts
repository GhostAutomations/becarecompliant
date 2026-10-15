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


/** The person an access token is for (its claims), without asking Auth. Only for use once the
 *  token has been checked: see lib/auth/verified-user.ts. */
export function decodeUserClaims(accessToken: string): {
  sub: string;
  email?: string;
  phone?: string;
  aud?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as {
      sub?: string;
    };
    return typeof payload.sub === "string" ? (payload as { sub: string }) : null;
  } catch {
    return null;
  }
}
