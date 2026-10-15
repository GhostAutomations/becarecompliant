import { NextRequest, NextResponse } from "next/server";

/**
 * A home's QR code or NFC sticker opens /c/<code> (Rota and Visits Stage 3, Phil 2026-10-16).
 * This only passes the code to the Clock in page, which works out the visit and records it. The
 * code is never a sign in: the page keeps its own, and the server checks the code belongs to the
 * place of a visit or shift the signed in carer is on. With no signal the phone's service worker
 * answers this address itself with the kept Clock in page, which reads the code from the address.
 */
export function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return params.then(({ token }) => {
    const url = new URL("/clock", request.nextUrl.origin);
    if (/^[0-9a-f]{36}$/.test(token)) url.searchParams.set("code", token);
    if (request.nextUrl.searchParams.get("via") === "nfc") url.searchParams.set("via", "nfc");
    return NextResponse.redirect(url, 303);
  });
}
