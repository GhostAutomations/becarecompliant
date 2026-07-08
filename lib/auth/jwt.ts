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
