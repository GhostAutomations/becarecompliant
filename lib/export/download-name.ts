/**
 * Be Care Compliant — the file name a download should be saved as, from the server's
 * Content-Disposition header. Pure and importless so it can be unit tested.
 */
export function fileNameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}
