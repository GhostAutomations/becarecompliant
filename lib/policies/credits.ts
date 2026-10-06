/**
 * What a policy costs in AI credits (Phil, 2026-10-06). A credit sells for 10p; writing reads up to
 * about 25,000 words of guidance and writes about 5,000, and improving also reads the provider's
 * policy and returns it in full, so one credit would not cover either. Kept out of the "use server"
 * file, which may only export async functions.
 */
export const POLICY_WRITE_CREDITS = 3;
export const POLICY_IMPROVE_CREDITS = 4;
