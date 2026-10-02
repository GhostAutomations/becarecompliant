import "server-only";
import { spendAiCredit, refundAiCredit } from "@/lib/billing/ai-credits";
import { recordUsage } from "@/lib/notifications/usage";

/**
 * One place to call the Anthropic Messages API: checks configuration, spends an
 * AI credit (refunding on failure), meters token usage, and returns plain text.
 * Callers decide how to use the text. Never throws to the client.
 */
export async function runAi(opts: {
  /** The company whose credit is spent. null is the founder working in the platform library
   *  (AI form import, 2 Oct 2026): no company pays, nothing is spent or metered against one. */
  companyId: string | null;
  feature: string;
  prompt: string;
  /** Extra content blocks sent BEFORE the prompt, such as a PDF or a picture to read. */
  attachments?: unknown[];
  system?: string;
  maxTokens?: number;
}): Promise<{ ok: string } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    return { error: "AI is not configured. Ask your administrator to set the AI keys." };
  }

  const companyId = opts.companyId;
  const refund = async () => {
    if (companyId) await refundAiCredit(companyId);
  };
  if (companyId) {
    const spent = await spendAiCredit(companyId);
    if (!spent.ok) return { error: spent.message };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1500,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [
          {
            role: "user",
            content: opts.attachments?.length
              ? [...opts.attachments, { type: "text", text: opts.prompt }]
              : opts.prompt,
          },
        ],
      }),
    });
  } catch (e) {
    await refund();
    return { error: `AI request failed: ${(e as Error).message}` };
  }
  if (!res.ok) {
    await refund();
    const detail = (await res.text().catch(() => "")).replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[redacted]");
    return { error: `AI request failed (${res.status}). ${detail.slice(0, 160)}` };
  }

  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (companyId) await recordUsage({
    companyId,
    kind: "ai",
    units: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
    metadata: {
      feature: opts.feature,
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
    },
  });

  const text = (json.content?.map((b) => b.text ?? "").join("") ?? "").trim();
  if (!text) {
    // An empty reply is not the caller's fault and must not cost them a credit: we
    // only deduct for work actually done. Report WHY, because "empty response" alone
    // is undiagnosable — stop_reason tells us whether it ran out of tokens, and the
    // block types tell us whether the text simply arrived in a shape we do not read.
    await refund();
    const stop = json.stop_reason ?? "unknown";
    const kinds = (json.content ?? []).map((b) => b.type ?? "?").join(", ") || "none";
    console.error("[ai] empty response", { feature: opts.feature, stop, kinds });
    return {
      error: `The AI returned nothing (${stop}${kinds === "none" ? "" : `, blocks: ${kinds}`}). Your credit has been returned. Try again.`,
    };
  }
  /* A REPLY THAT RAN OUT OF ROOM SAYS SO (2026-09-24). The readiness narrative hit its 1800 token
     limit on Thistle and stopped mid sentence, and nothing said it had: a manager could have
     handed an inspector a draft that simply ends. */
  if (json.stop_reason === "max_tokens") {
    console.warn("[ai] reply cut short at max_tokens", { feature: opts.feature });
    return {
      ok: `${text}\n\n(This reply was cut short because it reached its length limit. Ask about one theme at a time for the rest.)`,
    };
  }
  return { ok: text };
}
