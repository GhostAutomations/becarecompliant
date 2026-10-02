import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email/templates";
import { notifyFounder } from "@/lib/founder/notify";
import { siteUrl } from "@/lib/site";
import { DEMO_SURVEY_RATINGS } from "@/lib/demo/rules";

/**
 * TELL THE FOUNDER WHEN A DEMO SURVEY COMES BACK (Phil, 2026-10-01: "an email does need to go to
 * the founder as well"; popup: when they answer). Sent once, on the first answer for that login
 * (the database refuses a second one), with the seven scores and the three comments and a button
 * to the demo's founder page. Best effort: a failed send never stands between the client and
 * their "Thank you", and the answers are on the founder page whatever happens here.
 *
 * FOUNDER INBOX TOO (Phil, 2026-10-02), through notifyFounder like every founder notice: it lands
 * in the Founder Inbox even when email is down, from the demo login so Reply answers them.
 */
export async function emailFounderDemoFeedback(token: string): Promise<void> {
  try {
    const admin = createServiceClient();
    const { data: fb } = await admin
      .from("demo_feedback")
      .select("demo_id, login_id, ease_of_use, looks, registers_checks, forms_evidence, reports, overall, likely_to_sign_up, liked, disliked, better, submitted_via")
      .eq("token", token)
      .maybeSingle();
    if (!fb) return;
    const f = fb as Record<string, unknown>;
    const [{ data: demo }, { data: login }] = await Promise.all([
      admin.from("demos").select("id, client_name").eq("id", f.demo_id as string).maybeSingle(),
      f.login_id
        ? admin.from("demo_logins").select("full_name, email").eq("id", f.login_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const client = (demo as { client_name?: string } | null)?.client_name ?? "a client";
    const who = (login as { full_name?: string; email?: string } | null) ?? null;
    const scores = DEMO_SURVEY_RATINGS.map((q) => Number(f[q.key] ?? 0));
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const row = (k: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#8b93a7;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#e9ecf5;">${escapeHtml(v)}</td></tr>`;
    const rows = [
      row("From", who ? `${who.full_name ?? ""} (${who.email ?? ""})` : "A demo login"),
      ...DEMO_SURVEY_RATINGS.map((q, i) => row(q.label, `${scores[i]} / 5`)),
      row("Average", `${average.toFixed(1)} out of 5`),
      row("What they liked", String(f.liked ?? "").trim() || "Nothing written"),
      row("What they did not like", String(f.disliked ?? "").trim() || "Nothing written"),
      row("What we could do better", String(f.better ?? "").trim() || "Nothing written"),
    ].join("");
    const bodyHtml = `<p>The demo survey has been answered${f.submitted_via === "email" ? " from the emailed link" : " in the demo"}.</p><table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
    const bodyText = [
      `The demo survey for ${client} has been answered.`,
      `From: ${who ? `${who.full_name ?? ""} (${who.email ?? ""})` : "A demo login"}`,
      ...DEMO_SURVEY_RATINGS.map((q, i) => `${q.label}: ${scores[i]} / 5`),
      `Average: ${average.toFixed(1)} out of 5`,
      `What they liked: ${String(f.liked ?? "").trim() || "Nothing written"}`,
      `What they did not like: ${String(f.disliked ?? "").trim() || "Nothing written"}`,
      `What we could do better: ${String(f.better ?? "").trim() || "Nothing written"}`,
    ].join("\n");
    const told = await notifyFounder({
      subject: `Demo feedback: ${client}, ${average.toFixed(1)} out of 5`,
      heading: `Demo feedback from ${client}`,
      preheader: `${client} answered the demo survey: average ${average.toFixed(1)} out of 5`,
      bodyHtml,
      bodyText,
      ctaLabel: "Open the demo",
      ctaUrl: `${siteUrl()}/founder/demos/${(demo as { id?: string } | null)?.id ?? ""}`,
      companyId: null,
      fromAddress: who?.email ?? null,
      fromName: who?.full_name ? `${who.full_name} (demo)` : null,
      replyTo: who?.email ?? null,
    });
    if (!told.inbox && !told.emailed) console.error("[demo] founder feedback notice reached neither the inbox nor email");
  } catch (e) {
    console.error("[demo] founder feedback email failed:", (e as Error).message);
  }
}
