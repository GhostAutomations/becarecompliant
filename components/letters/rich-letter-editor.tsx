"use client";

/**
 * Be Care Compliant: the letter editor (Phil, 2026-10-12, Job 2 Part B, docs/decisions/letter-editor.md).
 *
 * TipTap, set up to allow exactly what a letter allows and nothing else: bold, italic, underline,
 * text size Small, Normal or Large, Heading and Subheading, bulleted and numbered lists, and line
 * breaks. Links, code, quotes, strike through and rules are switched off, so whatever is pasted
 * (Word, a web page, an email) keeps only those and arrives clean. Word's own bullet paragraphs are
 * turned into a real list on the way in.
 *
 * It holds LETTER HTML (lib/letters/rich-text.ts). Old plain text letters and templates are read in
 * by the rules they always had. The server cleans whatever is posted again, so this is a
 * convenience, never the safeguard.
 *
 * Drawn on a sheet the width of the PDF page, at the letter's own type size, so the words wrap where
 * the PDF wraps. Given the letter's frame (Phil, 2026-10-12: "the one on the left must match
 * exactly"), the sheet shows the whole letter as the PDF prints it: letterhead, date, Private and
 * confidential, address, Dear and the RE line above the words, the sign off below. Only the words
 * can be typed in. The meeting details print as their table here too, and can be locked so they
 * only ever follow the booking.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, Extension, Mark, Node, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { detailsDisplayHtml, detailsRowsOf, letterBlocksOf, toLetterHtml, type TextSize } from "@/lib/letters/rich-text";
import type { LetterFrame } from "@/lib/letters/letter-frame";

/** Small and Large text, written as <span data-size="small|large">. Normal is no mark at all. */
const LetterSize = Mark.create({
  name: "letterSize",
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-size");
          return v === "small" || v === "large" ? v : null;
        },
        renderHTML: (attrs) => (attrs.size ? { "data-size": attrs.size } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-size]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

type DetailRow = { label: string; value: string };
const FIXED_TIP = "Set by the meeting details above, not typed here";

/**
 * THE MEETING DETAILS (Date, Time, Length, Where, Held by) as one block, drawn as the PDF draws them:
 * bold labels lined up, no colons (Phil, 2026-10-12). Stored exactly as before, a paragraph of
 * "Label: value" lines, so the PDF, emails and saved letters read it as they always have. With
 * `locked`, the block cannot be removed either: it follows the booking fields, never the typing.
 */
const LetterDetails = Node.create<{ locked: boolean }>({
  name: "letterDetails",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addOptions() {
    return { locked: false };
  },
  addAttributes() {
    return { rows: { default: [] as DetailRow[], rendered: false } };
  },
  parseHTML() {
    return [
      {
        tag: "p",
        priority: 60,
        getAttrs: (el) => {
          const block = letterBlocksOf((el as HTMLElement).outerHTML)[0];
          const rows = block ? detailsRowsOf(block) : null;
          return rows ? { rows } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    const rows = (node.attrs.rows ?? []) as DetailRow[];
    const parts: unknown[] = [];
    rows.forEach((r, i) => {
      if (i > 0) parts.push(["br"]);
      parts.push(`${r.label}: ${r.value}`);
    });
    return ["p", {}, ...parts] as never;
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.contentEditable = "false";
      dom.className = "letter-fixed";
      dom.title = FIXED_TIP;
      dom.innerHTML = detailsDisplayHtml((node.attrs.rows ?? []) as DetailRow[]);
      return { dom };
    };
  },
  addProseMirrorPlugins() {
    if (!this.options.locked) return [];
    const count = (doc: { descendants: (f: (n: { type: { name: string } }) => boolean | void) => void }) => {
      let n = 0;
      doc.descendants((node) => {
        if (node.type.name === "letterDetails") n++;
      });
      return n;
    };
    return [
      new Plugin({
        key: new PluginKey("letterDetailsLock"),
        // A change that would take the details out is refused; replacing the whole letter is not.
        filterTransaction: (tr, state) =>
          !tr.docChanged || tr.getMeta("preventUpdate") || tr.getMeta("letterReplace") || count(tr.doc) >= count(state.doc),
      }),
    ];
  },
});

/**
 * What the letter adds after its first paragraph that the words themselves do not hold (Settings,
 * Letters: the invitation template's meeting details and absences, drawn with example details),
 * shown in place, greyed, never typed in.
 */
const insertKey = new PluginKey("letterInsert");
const LetterInsert = Extension.create({
  name: "letterInsert",
  addStorage() {
    return { html: "" };
  },
  addProseMirrorPlugins() {
    const storage = this.storage as { html: string };
    return [
      new Plugin({
        key: insertKey,
        props: {
          decorations(state) {
            if (!storage.html || !state.doc.firstChild) return null;
            const pos = state.doc.firstChild.nodeSize;
            const html = storage.html;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                pos,
                () => {
                  const el = document.createElement("div");
                  el.contentEditable = "false";
                  el.className = "letter-fixed letter-insert";
                  el.title = "Added by the letter from the meeting details, not typed here";
                  el.innerHTML = html;
                  return el;
                },
                { side: -1, key: html },
              ),
            ]);
          },
        },
      }),
    ];
  },
});

/**
 * Word writes a bulleted line as a paragraph with the bullet drawn as text inside a span it marks
 * "mso-list:Ignore". Those paragraphs become a real list, without the drawn bullet; everything else
 * is left for the editor's own rules to clean.
 */
function wordListsToLists(html: string): string {
  if (typeof DOMParser === "undefined" || !/mso-list|MsoList/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("[style*='mso-list:Ignore' i], [style*='mso-list: Ignore' i]").forEach((n) => n.remove());
  const paras = Array.from(doc.body.querySelectorAll("p")).filter(
    (p) => /MsoList/i.test(p.className || "") || /mso-list/i.test(p.getAttribute("style") || ""),
  );
  for (const p of paras) {
    const prev = p.previousElementSibling;
    const list = prev && prev.tagName === "UL" && prev.getAttribute("data-word") ? prev : doc.createElement("ul");
    if (list !== prev) {
      list.setAttribute("data-word", "1");
      p.before(list);
    }
    const li = doc.createElement("li");
    li.innerHTML = p.innerHTML;
    list.appendChild(li);
    p.remove();
  }
  return doc.body.innerHTML;
}

export type RichLetterEditorHandle = {
  /** Put text (a {{token}}, say) where the cursor is. */
  insertText: (text: string) => void;
};

type Props = {
  /** Letter HTML, or old plain text, which is read in and shown formatted. */
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Shown when there are no words yet. */
  placeholder?: string;
  /** For a screen reader: what this editor is. */
  label?: string;
  /** Everything the PDF prints around the words, so the sheet shows the whole letter. */
  frame?: LetterFrame | null;
  /** The meeting details follow the booking: they cannot be typed over or removed. */
  lockDetails?: boolean;
  /** Read only blocks the letter adds after its first paragraph (Settings, Letters). */
  insertAfterFirst?: string | null;
};

const RichLetterEditor = forwardRef<RichLetterEditorHandle, Props>(function RichLetterEditor(
  { value, onChange, disabled, placeholder, label, frame, lockDetails, insertAfterFirst },
  ref,
) {
  const lastSent = useRef<string>("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        strike: false,
      }),
      LetterSize,
      LetterDetails.configure({ locked: Boolean(lockDetails) }),
      LetterInsert,
    ],
    content: toLetterHtml(value),
    editorProps: {
      attributes: {
        class: "letter-editor-body",
        ...(label ? { "aria-label": label } : {}),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
      transformPastedHTML: wordListsToLists,
    },
    onUpdate: ({ editor: e, transaction }) => {
      // Only a change to the words counts as an edit.
      if (!transaction.docChanged) return;
      const html = toLetterHtml(e.getHTML());
      lastSent.current = html;
      onChange(html);
    },
  });

  // A new value from outside (the standard letter redrawn, a draft arriving) replaces the words;
  // the value this editor just sent back does not, so typing never jumps.
  useEffect(() => {
    if (!editor) return;
    const next = toLetterHtml(value);
    if (next === lastSent.current) return;
    if (next === toLetterHtml(editor.getHTML())) return;
    lastSent.current = next;
    editor.chain().setMeta("letterReplace", true).setContent(next, { emitUpdate: false }).run();
  }, [value, editor]);

  // The read only blocks after the first paragraph: redrawn when they change.
  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as unknown as Record<string, { html: string }>).letterInsert;
    if (!storage || storage.html === (insertAfterFirst ?? "")) return;
    storage.html = insertAfterFirst ?? "";
    editor.view.dispatch(editor.state.tr.setMeta(insertKey, true));
  }, [insertAfterFirst, editor]);

  // Locked or unlocked without reporting a change: TipTap's setEditable announces an update by
  // default, which read as "the letter was edited and is now empty" (found testing, 12 Oct).
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      editor?.chain().focus().insertContent(text).run();
    },
  }));

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            bullets: e.isActive("bulletList"),
            numbers: e.isActive("orderedList"),
            block: e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
            size: ((e.getAttributes("letterSize").size as TextSize | undefined) ?? "normal") as TextSize | "normal",
            empty: e.isEmpty,
          }
        : null,
  });

  const tool = (on: boolean | undefined, label: string, title: string, run: () => void, extra = "") => (
    <button
      type="button"
      className={`letter-tool${on ? " letter-tool-on" : ""} ${extra}`}
      aria-pressed={on ? "true" : "false"}
      title={title}
      disabled={disabled || !editor}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  return (
    <div className={`letter-editor${state?.empty ? " is-empty" : ""}`}>
      <div className="letter-toolbar" role="toolbar" aria-label="Formatting">
        <select
          className="letter-tool-select"
          aria-label="Text style"
          value={state?.block ?? "p"}
          disabled={disabled || !editor}
          onChange={(e) => {
            const v = e.target.value;
            const c = editor?.chain().focus();
            if (v === "h2") c?.setHeading({ level: 2 }).run();
            else if (v === "h3") c?.setHeading({ level: 3 }).run();
            else c?.setParagraph().run();
          }}
        >
          <option value="p">Normal text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        <select
          className="letter-tool-select"
          aria-label="Text size"
          value={state?.size ?? "normal"}
          disabled={disabled || !editor}
          onChange={(e) => {
            const v = e.target.value;
            const c = editor?.chain().focus();
            if (v === "small" || v === "large") c?.setMark("letterSize", { size: v }).run();
            else c?.unsetMark("letterSize").run();
          }}
        >
          <option value="small">Small</option>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
        <span className="letter-tool-gap" aria-hidden />
        {tool(state?.bold, "B", "Bold", () => editor?.chain().focus().toggleBold().run(), "font-bold")}
        {tool(state?.italic, "I", "Italic", () => editor?.chain().focus().toggleItalic().run(), "italic")}
        {tool(state?.underline, "U", "Underline", () => editor?.chain().focus().toggleUnderline().run(), "underline")}
        <span className="letter-tool-gap" aria-hidden />
        {tool(state?.bullets, "• List", "Bulleted list", () => editor?.chain().focus().toggleBulletList().run())}
        {tool(state?.numbers, "1. List", "Numbered list", () => editor?.chain().focus().toggleOrderedList().run())}
      </div>
      <div className="letter-paper">
        {frame ? (
          <div className="letter-sheet">
            <FrameTop frame={frame} />
            <EditorContent editor={editor} />
            <FrameBottom frame={frame} />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </div>
  );
});

/** Above the words, as the PDF prints it. Fixed: set by the company, the person and the meeting. */
function FrameTop({ frame }: { frame: LetterFrame }) {
  return (
    <div className="letter-fixed" title="Printed on every letter, not typed here">
      <div className="letter-head">
        {frame.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frame.logoUrl} alt={frame.companyName} className="letter-logo" />
        ) : (
          <div className="letter-company">{frame.companyName}</div>
        )}
        <div className="letter-head-right">
          {frame.letterheadLines.map((l, i) => (
            <div key={`a${i}`}>{l}</div>
          ))}
          {frame.phoneLines.length ? <div className="letter-head-gap" /> : null}
          {frame.phoneLines.map((l, i) => (
            <div key={`p${i}`} className="letter-head-phone">{l}</div>
          ))}
        </div>
      </div>
      <div className="letter-date">{frame.date}</div>
      <div className="letter-confidential">Private and confidential</div>
      <div className="letter-recipient">
        {frame.recipientLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="letter-salutation">{frame.salutation}</div>
      <div className="letter-re">{frame.reLine}</div>
    </div>
  );
}

/** Below the words: the sign off, the signature or room to sign, the name and job title. */
function FrameBottom({ frame }: { frame: LetterFrame }) {
  return (
    <div className="letter-fixed letter-signoff" title="Set by the signature choice, not typed here">
      <div>{frame.signOff.closing}</div>
      {frame.signatureUrl ? (
        <div className="letter-sign-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frame.signatureUrl} alt="Signature" />
        </div>
      ) : null}
      <div className={frame.signatureUrl ? "letter-sign-name" : "letter-sign-name letter-sign-room"}>{frame.signOff.name}</div>
      {frame.signOff.role ? <div>{frame.signOff.role}</div> : null}
    </div>
  );
}

export default RichLetterEditor;
