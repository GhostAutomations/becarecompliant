"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { TWILIO_BALANCE_TAG } from "@/lib/sms/balance";
import { fillSmsCosts } from "@/lib/sms/costs";

/** Refresh on the Founder's Twilio tile (Phil, 2026-10-15): read the balance again now, and record
 *  the cost of any text Twilio has priced since. Founder only. */
export async function refreshTwilioBalance(): Promise<{ ok: boolean }> {
  await requirePlatformAdmin();
  revalidateTag(TWILIO_BALANCE_TAG);
  await fillSmsCosts();
  revalidatePath("/founder");
  return { ok: true };
}
