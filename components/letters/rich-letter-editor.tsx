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
 * the PDF wraps.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, Mark, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { toLetterHtml, type TextSize } from "@/lib/letters/rich-text";

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
};

const RichLetterEditor = forwardRef<RichLetterEditorHandle, Props>(function RichLetterEditor(
  { value, onChange, disabled, placeholder, label },
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
    onUpdate: ({ editor: e }) => {
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
    editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
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
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

export default RichLetterEditor;
