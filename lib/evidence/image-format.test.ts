import test from "node:test";
import assert from "node:assert/strict";

/** RELATIVE, EXTENSIONED: node --experimental-strip-types resolves neither aliases nor
 *  extensionless files, so the module under test is reached this way. */
import {
  DRAWN_IMAGE_MAX_HEIGHT,
  DRAWN_IMAGE_WIDTH,
  MAX_DRAWN_IMAGE_BYTES,
  MAX_DRAWN_IMAGES,
  MAX_DRAWN_TOTAL_BYTES,
  drawableFormat,
  drawnImageBox,
  imagePixelSize,
  planEvidenceAttachments,
  type AttachmentRow,
} from "./image-format.ts";

function row(over: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    fieldKey: "upload_photo_of_document",
    kind: "upload",
    fileName: "passport.jpg",
    storagePath: "co/ev/files/upload_photo_of_document-passport.jpg",
    mimeType: "image/jpeg",
    bytes: 1024,
    ...over,
  };
}

// --- what can be drawn -------------------------------------------------------

test("png and jpeg are drawn", () => {
  assert.equal(drawableFormat("image/png", "x.png"), "png");
  assert.equal(drawableFormat("image/jpeg", "x.jpg"), "jpg");
  assert.equal(drawableFormat("IMAGE/JPEG", "x.jpg"), "jpg");
  assert.equal(drawableFormat("image/jpg", "x.jpg"), "jpg");
});

// An iPhone uploads HEIC by default and no PDF engine can decode it. Refusing it
// here is the whole reason the document names the file instead of drawing it.
test("a real image type the renderer cannot decode is refused, even with an image extension", () => {
  assert.equal(drawableFormat("image/heic", "IMG_4471.HEIC"), null);
  assert.equal(drawableFormat("image/heif", "IMG_4471.heif"), null);
  assert.equal(drawableFormat("image/webp", "shot.webp"), null);
  assert.equal(drawableFormat("image/gif", "anim.gif"), null);
  assert.equal(drawableFormat("image/svg+xml", "logo.svg"), null);
});

test("a document is refused", () => {
  assert.equal(drawableFormat("application/pdf", "dbs.pdf"), null);
  assert.equal(
    drawableFormat("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "letter.docx"),
    null,
  );
});

// A wrong mime must never be rescued by a lying extension: this is the case that
// would hand @react-pdf bytes it cannot decode.
test("a misnamed file follows its mime type, not its extension", () => {
  assert.equal(drawableFormat("application/pdf", "actually-a.jpg"), null);
  assert.equal(drawableFormat("image/heic", "renamed.png"), null);
});

test("a missing or generic mime type falls back to the extension", () => {
  assert.equal(drawableFormat(null, "passport.JPG"), "jpg");
  assert.equal(drawableFormat("", "passport.jpeg"), "jpg");
  assert.equal(drawableFormat("application/octet-stream", "scan.png"), "png");
  assert.equal(drawableFormat("application/octet-stream", "scan.heic"), null);
  assert.equal(drawableFormat(null, null), null);
  assert.equal(drawableFormat(null, "no-extension"), null);
});

// --- planning a record's attachments -----------------------------------------

test("a drawable photo is planned to be drawn", () => {
  const [plan] = planEvidenceAttachments([row()]);
  assert.equal(plan.format, "jpg");
  assert.equal(plan.reason, null);
  assert.equal(plan.fileName, "passport.jpg");
});

// The point of the whole item: an undrawable file is still NAMED on the paper, so
// an inspector can tell "nothing attached" from "something attached I cannot see".
test("an undrawable file is kept in the plan so the document still names it", () => {
  const plans = planEvidenceAttachments([row({ mimeType: "application/pdf", fileName: "dbs.pdf" })]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].format, null);
  assert.equal(plans[0].reason, "unsupported_format");
  assert.equal(plans[0].fileName, "dbs.pdf");
});

test("a row with no storage path is dropped, because the document must not promise a file that is not there", () => {
  assert.deepEqual(planEvidenceAttachments([row({ storagePath: null })]), []);
});

test("a nameless file still reads as something rather than as blank", () => {
  const [plan] = planEvidenceAttachments([row({ fileName: "   ", mimeType: "application/pdf" })]);
  assert.equal(plan.fileName, "Attached file");
});

test("an oversized image is named, not drawn", () => {
  const [plan] = planEvidenceAttachments([row({ bytes: MAX_DRAWN_IMAGE_BYTES + 1 })]);
  assert.equal(plan.format, null);
  assert.equal(plan.reason, "too_large");
});

test("the count cap holds, and everything past it is still named", () => {
  const rows = Array.from({ length: MAX_DRAWN_IMAGES + 3 }, (_, i) =>
    row({ fieldKey: `f${i}`, storagePath: `co/ev/files/f${i}.jpg` }),
  );
  const plans = planEvidenceAttachments(rows);
  assert.equal(plans.length, MAX_DRAWN_IMAGES + 3);
  assert.equal(plans.filter((p) => p.format).length, MAX_DRAWN_IMAGES);
  assert.equal(plans[MAX_DRAWN_IMAGES].reason, "too_many");
});

test("the total byte budget holds across a record", () => {
  const half = Math.floor(MAX_DRAWN_TOTAL_BYTES / 2) + 1;
  const plans = planEvidenceAttachments([
    row({ fieldKey: "a", storagePath: "co/ev/a.jpg", bytes: Math.min(half, MAX_DRAWN_IMAGE_BYTES) }),
    row({ fieldKey: "b", storagePath: "co/ev/b.jpg", bytes: Math.min(half, MAX_DRAWN_IMAGE_BYTES) }),
    row({ fieldKey: "c", storagePath: "co/ev/c.jpg", bytes: Math.min(half, MAX_DRAWN_IMAGE_BYTES) }),
    row({ fieldKey: "d", storagePath: "co/ev/d.jpg", bytes: Math.min(half, MAX_DRAWN_IMAGE_BYTES) }),
  ]);
  const drawnBytes = plans
    .filter((p) => p.format)
    .reduce((sum) => sum + Math.min(half, MAX_DRAWN_IMAGE_BYTES), 0);
  assert.ok(drawnBytes <= MAX_DRAWN_TOTAL_BYTES);
  assert.ok(plans.some((p) => p.reason === "budget_exceeded"));
});

// A big Word document sitting next to a photo must not spend the photo's budget.
test("an undrawable file does not consume the drawing budget", () => {
  const plans = planEvidenceAttachments([
    row({ fieldKey: "doc", storagePath: "co/ev/doc.pdf", mimeType: "application/pdf", bytes: MAX_DRAWN_TOTAL_BYTES }),
    row({ fieldKey: "photo", storagePath: "co/ev/photo.jpg", bytes: 2048 }),
  ]);
  assert.equal(plans[1].format, "jpg");
  assert.equal(plans[1].reason, null);
});

test("bytes missing on the row does not block a draw", () => {
  const [plan] = planEvidenceAttachments([row({ bytes: null })]);
  assert.equal(plan.format, "jpg");
});

// --- reading a picture's shape -----------------------------------------------
//
// This is what stops a drawn photograph reserving more room than it needs. The first
// version reserved a square whatever the picture's shape, and the wasted space under a
// landscape photo pushed a real Supervision record onto a blank second page.

function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  b.writeUInt8(0x89, 0);
  b.write("PNG", 1, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpegHeader(width: number, height: number, marker = 0xc0): Buffer {
  // SOI, then one APP0-style segment to be skipped, then the frame marker.
  const b = Buffer.alloc(40, 0);
  b.writeUInt16BE(0xffd8, 0);
  b.writeUInt16BE(0xffe0, 2);
  b.writeUInt16BE(10, 4); // segment length, skipped
  const at = 14;
  b.writeUInt8(0xff, at);
  b.writeUInt8(marker, at + 1);
  b.writeUInt16BE(11, at + 2); // frame length
  b.writeUInt8(8, at + 4); // precision
  b.writeUInt16BE(height, at + 5);
  b.writeUInt16BE(width, at + 7);
  return b;
}

test("a PNG's size is read from its header", () => {
  assert.deepEqual(imagePixelSize(pngHeader(600, 400)), { width: 600, height: 400 });
});

test("a JPEG's size is read from the frame marker, past earlier segments", () => {
  assert.deepEqual(imagePixelSize(jpegHeader(1024, 768)), { width: 1024, height: 768 });
  // Progressive JPEGs (SOF2) are what a phone often produces.
  assert.deepEqual(imagePixelSize(jpegHeader(300, 900, 0xc2)), { width: 300, height: 900 });
});

test("an unreadable file gives up quietly rather than throwing inside a render", () => {
  assert.equal(imagePixelSize(Buffer.alloc(0)), null);
  assert.equal(imagePixelSize(Buffer.from("not an image at all", "latin1")), null);
  assert.equal(imagePixelSize(Buffer.from([0xff, 0xd8, 0xff])), null); // truncated JPEG
  assert.equal(imagePixelSize(pngHeader(0, 0)), null);
});

// --- the box the picture is drawn in -----------------------------------------

test("a landscape photo reserves only the height it needs", () => {
  const box = drawnImageBox(600, 400);
  assert.equal(box.width, DRAWN_IMAGE_WIDTH);
  assert.equal(box.height, Math.round(DRAWN_IMAGE_WIDTH * (400 / 600)));
  assert.ok(box.height < DRAWN_IMAGE_WIDTH, "a landscape box must be shorter than it is wide");
});

// A phone's ordinary portrait photo. It must fit at full width without being narrowed,
// because that is the shape a manager photographing a passport actually produces.
test("a 3 by 4 portrait photo keeps its shape at full width", () => {
  const box = drawnImageBox(600, 800);
  assert.equal(box.width, DRAWN_IMAGE_WIDTH);
  assert.equal(box.height, Math.round(DRAWN_IMAGE_WIDTH * (800 / 600)));
  assert.ok(box.height <= DRAWN_IMAGE_MAX_HEIGHT);
});

// The one that protects the page: nothing may ever be taller than the cap, or the
// picture is clipped by the edge of the paper.
test("a very tall picture is capped and narrowed, never clipped", () => {
  const box = drawnImageBox(200, 4000);
  assert.equal(box.height, DRAWN_IMAGE_MAX_HEIGHT);
  assert.ok(box.width < DRAWN_IMAGE_WIDTH);
  assert.ok(box.width >= 1);
});

test("an unknown size falls back to the safe square", () => {
  assert.deepEqual(drawnImageBox(undefined, undefined), {
    width: DRAWN_IMAGE_WIDTH,
    height: DRAWN_IMAGE_WIDTH,
  });
  assert.deepEqual(drawnImageBox(0, 0), { width: DRAWN_IMAGE_WIDTH, height: DRAWN_IMAGE_WIDTH });
});

test("an extremely wide picture still gets a visible height", () => {
  const box = drawnImageBox(8000, 20);
  assert.ok(box.height >= 1);
});
