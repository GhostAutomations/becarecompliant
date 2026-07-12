"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit";
import { decodeSessionId } from "@/lib/auth/jwt";
import { syncSeatQuantity } from "@/lib/billing/stripe-sync";
import type { ActionState } from "@/lib/forms";

/** Invitee sets their password and their account activates. */
export async function completeInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (password.length < 8) {
    return { error: "Choose a password of at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The passwords do not match." };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, company_id, role, status, email, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { error: "We could not find your profile. Contact your administrator." };
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
    password,
  });
  if (pwErr) {
    return { error: pwErr.message };
  }

  await admin
    .from("profiles")
    .update({ status: "active", full_name: fullName || profile.full_name })
    .eq("id", user.id);

  await admin
    .from("invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("company_id", profile.company_id)
    .eq("email", profile.email)
    .eq("status", "pending");

  await writeAudit({
    companyId: profile.company_id,
    actorId: user.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "invite.accepted",
    entityType: "profile",
    entityId: user.id,
    summary: "Accepted invite and set password",
  });

  // A new active user may cross the 4 included seats: push the seat quantity to
  // Stripe (best-effort, never blocks activation; no-op if unbilled/Diamond/Black).
  if (profile.company_id) {
    await syncSeatQuantity(profile.company_id);
  }

  // Refresh the single-session claim after the password change.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const sessionId = decodeSessionId(session.access_token);
    if (sessionId) {
      await supabase.rpc("claim_session", { p_session_id: sessionId });
    }
  }

  redirect("/dashboard");
}
