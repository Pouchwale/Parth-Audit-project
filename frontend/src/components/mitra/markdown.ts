// A TINY, SAFE RENDERER FOR WHAT MITRA WRITES (components/mitra).
//
// The model answers in light markdown — a bold word, a `format number`, a
// few bullets, a numbered list of steps — and the app's own canned replies
// already use "• " bullets and line breaks. This turns that text into React
// nodes and nothing else: no dependency, no HTML parsing, no
// dangerouslySetInnerHTML. Every character of the person's or the model's
// text becomes a TEXT node, so "<script>" stays the letters "<script>" on the
// screen, whatever a file the person attached may have said.
//
// What is understood, and no more:
//   paragraphs   blank lines separate them; a single newline is a line break
//   bullets      lines starting "- ", "* " or "• "
//   numbered     lines starting "1. " or "1) " (up to three digits)
//   headings     lines starting "# " … "###### " — drawn as a bold line
//   **bold**     inline
//   `code`       inline, in the app's monospace face
// Anything else — an unmatched "**", a lone "-", a URL — is plain text.
//
// The parser is pure and returns a small tree (frontend/tests/mitraMarkdown
// .test.ts checks it); the renderer maps that tree to elements.
import { createElement, Fragment, type ReactNode } from "react";

export type MdInline = { type: "text"; text: string } | { type: "bold"; text: string } | { type: "code"; text: string };

export type MdBlock =
  | { type: "paragraph"; lines: MdInline[][] }
  | { type: "heading"; inlines: MdInline[] }
  | { type: "bullets"; items: MdInline[][] }
  | { type: "numbered"; start: number; items: MdInline[][] };

const BULLET_RE = /^\s{0,3}[-*•]\s+(\S.*)$/;
const NUMBER_RE = /^\s{0,3}(\d{1,3})[.)]\s+(\S.*)$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(\S.*)$/;
// Code first, so a backtick span is never read for the "**" inside it.
const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+?\*\*)/g;

/** The inline marks of one line: text, **bold**, `code`. Unmatched marks stay as text. */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    const token = m[0];
    if (token.startsWith("`")) out.push({ type: "code", text: token.slice(1, -1) });
    else out.push({ type: "bold", text: token.slice(2, -2) });
    last = at + token.length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** The blocks of a message, in order. Pure: the same text always gives the same tree. */
export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: MdInline[][] | null = null;
  // A list runs on only from one item straight to the next: a blank line, a
  // heading or plain text ends it, and the next item starts a list of its own.
  let listOpen = false;
  const flush = () => {
    if (paragraph && paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = null;
  };
  const lastBlock = () => blocks[blocks.length - 1];

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      listOpen = false;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      listOpen = false;
      blocks.push({ type: "heading", inlines: parseInline(heading[1]) });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flush();
      const prev = lastBlock();
      if (listOpen && prev && prev.type === "bullets") prev.items.push(parseInline(bullet[1]));
      else blocks.push({ type: "bullets", items: [parseInline(bullet[1])] });
      listOpen = true;
      continue;
    }
    const numbered = NUMBER_RE.exec(line);
    if (numbered) {
      flush();
      const prev = lastBlock();
      if (listOpen && prev && prev.type === "numbered") prev.items.push(parseInline(numbered[2]));
      else blocks.push({ type: "numbered", start: Number(numbered[1]), items: [parseInline(numbered[2])] });
      listOpen = true;
      continue;
    }
    listOpen = false;
    (paragraph ??= []).push(parseInline(line));
  }
  flush();
  return blocks;
}

function renderInline(nodes: MdInline[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === "bold") return createElement("strong", { key: `${key}b${i}` }, n.text);
    if (n.type === "code") return createElement("code", { key: `${key}c${i}`, className: "mitra-code" }, n.text);
    return n.text;
  });
}

function renderLines(lines: MdInline[][], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(createElement("br", { key: `${key}br${i}` }));
    out.push(...renderInline(line, `${key}l${i}`));
  });
  return out;
}

function renderBlock(block: MdBlock, key: string): ReactNode {
  switch (block.type) {
    case "heading":
      return createElement("p", { key, className: "mitra-heading" }, ...renderInline(block.inlines, key));
    case "bullets":
      return createElement(
        "ul",
        { key, className: "mitra-list" },
        ...block.items.map((item, i) => createElement("li", { key: `${key}i${i}` }, ...renderInline(item, `${key}i${i}`)))
      );
    case "numbered":
      return createElement(
        "ol",
        { key, className: "mitra-list", start: block.start === 1 ? undefined : block.start },
        ...block.items.map((item, i) => createElement("li", { key: `${key}i${i}` }, ...renderInline(item, `${key}i${i}`)))
      );
    default:
      return createElement("p", { key }, ...renderLines(block.lines, key));
  }
}

/** The message as React nodes — text nodes and a few plain elements, never HTML. */
export function renderMarkdown(text: string): ReactNode {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return text;
  return createElement(Fragment, null, ...blocks.map((b, i) => renderBlock(b, `m${i}`)));
}

/** The same message with its marks removed — for reading a reply aloud, or a one-line title. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*•]\s+/gm, "");
}
