import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { MAPKIT_ORIGIN, MAPKIT_TOKEN_SECONDS, mapkitToken } from "./mapkit-token.ts";

test("the Apple Maps pass is an ES256 token Apple can check: header, claims, signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = mapkitToken({ teamId: "TEAM123456", keyId: "KEY1234567", privateKeyPem: pem, nowSeconds: 1_800_000_000 });
  const [h, c, s] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.deepEqual(claims, { iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_000 + MAPKIT_TOKEN_SECONDS, origin: MAPKIT_ORIGIN });
  const sig = Buffer.from(s, "base64url");
  assert.equal(sig.length, 64);
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig));
});

test("a key pasted with its line breaks written as \\n still works", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
  assert.equal(mapkitToken({ teamId: "T", keyId: "K", privateKeyPem: pem, nowSeconds: 1 }).split(".").length, 3);
});
