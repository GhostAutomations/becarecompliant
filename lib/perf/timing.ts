/**
 * TEMPORARY speed timings (Phil, 2026-10-07: "Time each step, then fix"). Each line goes to the
 * Vercel runtime logs as `[perf] <label> <ms>`, so the slow steps of a page load can be read off
 * real requests rather than guessed. No personal data is logged: labels only. Remove once the
 * fixes are in.
 */
export async function timed<T>(label: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
  const start = Date.now();
  try {
    return await (typeof work === "function" ? work() : work);
  } finally {
    console.log(`[perf] ${label} ${Date.now() - start}`);
  }
}
