// THE RENDERER FOR WHAT MITRA WRITES (components/mitra/markdown.ts).
//
// The model answers in light markdown and the app's own replies use "• "
// bullets; both are drawn by a parser of a few lines with no dependency and
// no HTML. These check the tree it builds and the elements React is handed —
// above all that text stays text: a "<script>" in a file the person attached
// must reach React as a STRING child (which React escapes) and never as an
// element, whatever it says.
//
// The element tree is walked here rather than rendered with react-dom/server,
// which the test bundler cannot load; what matters is the tree anyway — React
// turns a string child into text, always.
import test from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { parseInline, parseMarkdown, renderMarkdown, stripMarkdown } from "../src/components/mitra/markdown";

type Props = { children?: ReactNode; className?: string; start?: number };

/** The tree as a string: elements as tags, every text node in [brackets]. */
function draw(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return `[${String(node)}]`;
  if (Array.isArray(node)) return node.map(draw).join("");
  if (isValidElement(node)) {
    const el = node as ReactElement<Props>;
    if (typeof el.type !== "string") return draw(el.props.children); // a Fragment
    if (el.type === "br") return "<br/>";
    const attrs = `${el.props.className ? ` class="${el.props.className}"` : ""}${el.props.start !== undefined ? ` start="${el.props.start}"` : ""}`;
    return `<${el.type}${attrs}>${draw(el.props.children)}</${el.type}>`;
  }
  return "";
}

/** Every element type in the tree. */
function tags(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => tags(n, out));
  else if (isValidElement(node)) {
    const el = node as ReactElement<Props>;
    if (typeof el.type === "string") out.push(el.type);
    tags(el.props.children, out);
  }
  return out;
}

/** The text nodes of the tree, joined. */
function words(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(words).join("");
  if (isValidElement(node)) return words((node as ReactElement<Props>).props.children);
  return "";
}

const html = (text: string) => draw(renderMarkdown(text));

test("bold and inline code are marked, and unmatched marks stay as text", () => {
  assert.deepEqual(parseInline("Open **F/HR/17** with `npm test` now"), [
    { type: "text", text: "Open " },
    { type: "bold", text: "F/HR/17" },
    { type: "text", text: " with " },
    { type: "code", text: "npm test" },
    { type: "text", text: " now" },
  ]);
  assert.deepEqual(parseInline("a ** b ` c"), [{ type: "text", text: "a ** b ` c" }]);
  // A "**" inside a code span belongs to the code.
  assert.deepEqual(parseInline("`a**b` **c**"), [
    { type: "code", text: "a**b" },
    { type: "text", text: " " },
    { type: "bold", text: "c" },
  ]);
  assert.equal(html("Open **F/HR/17** with `npm test`"), '<p>[Open ]<strong>[F/HR/17]</strong>[ with ]<code class="mitra-code">[npm test]</code></p>');
});

test("bullets in any of the three marks make one list", () => {
  const blocks = parseMarkdown("Checked:\n- viscosity\n• temperature\n* pH");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "paragraph");
  assert.deepEqual(blocks[1], {
    type: "bullets",
    items: [[{ type: "text", text: "viscosity" }], [{ type: "text", text: "temperature" }], [{ type: "text", text: "pH" }]],
  });
  assert.equal(html("- a\n- b"), '<ul class="mitra-list"><li>[a]</li><li>[b]</li></ul>');
  // A lone dash is not a bullet.
  assert.equal(parseMarkdown("-")[0].type, "paragraph");
});

test("numbered lists keep their first number", () => {
  const blocks = parseMarkdown("1. open it\n2. fill it\n\n3) submit");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, "numbered");
  assert.equal(blocks[0].type === "numbered" && blocks[0].items.length, 2);
  assert.equal(blocks[1].type === "numbered" && blocks[1].start, 3);
  assert.equal(html("1. a\n2. b"), '<ol class="mitra-list"><li>[a]</li><li>[b]</li></ol>');
  assert.equal(html("3. c"), '<ol class="mitra-list" start="3"><li>[c]</li></ol>');
  // A year or a big number followed by a full stop is not a list.
  assert.equal(parseMarkdown("2026. That year the plant grew.")[0].type, "paragraph");
});

test("paragraphs are split by blank lines and keep their line breaks", () => {
  const blocks = parseMarkdown("first line\nsecond line\n\nthird\r\n\r\nfourth");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type === "paragraph" && blocks[0].lines.length, 2);
  assert.equal(html("first\nsecond\n\nthird"), "<p>[first]<br/>[second]</p><p>[third]</p>");
  // The app's own replies, with their "• " bullets under a sentence.
  assert.equal(html("Filled it:\n• Date — today\n• Area — Store"), '<p>[Filled it:]</p><ul class="mitra-list"><li>[Date — today]</li><li>[Area — Store]</li></ul>');
  // Empty text renders as itself, and nothing else.
  assert.equal(renderMarkdown(""), "");
  assert.deepEqual(parseMarkdown("   \n\n"), []);
});

test("a heading line is drawn as a bold line, but a route is not a heading", () => {
  assert.deepEqual(parseMarkdown("## What I did")[0], { type: "heading", inlines: [{ type: "text", text: "What I did" }] });
  assert.equal(html("## Title"), '<p class="mitra-heading">[Title]</p>');
  assert.equal(parseMarkdown("#/assistant is the page")[0].type, "paragraph");
});

test("HTML in the text stays text — no element is ever made from it", () => {
  const evil = '<script>alert(1)</script> & <b onclick="x()">bold?</b>';
  const tree = renderMarkdown(evil);
  assert.deepEqual(tags(tree), ["p"]);
  assert.equal(words(tree), evil);
  // Inside a mark too: the mark is the element, its contents a string.
  const marked = renderMarkdown("**<i>x</i>** and `<u>y</u>`");
  assert.deepEqual(tags(marked), ["p", "strong", "code"]);
  assert.equal(words(marked), "<i>x</i> and <u>y</u>");
  // A list item as well.
  const item = renderMarkdown("- <img src=x onerror=alert(1)>");
  assert.deepEqual(tags(item), ["ul", "li"]);
  assert.equal(words(item), "<img src=x onerror=alert(1)>");
  // And nothing in the tree carries HTML as a property.
  assert.equal(JSON.stringify(item).includes("dangerouslySetInnerHTML"), false);
});

test("the marks come off for reading aloud", () => {
  assert.equal(stripMarkdown("**Done** — `F/HR/17`\n- checked\n## Next"), "Done — F/HR/17\nchecked\nNext");
  assert.equal(stripMarkdown("1. keep the number"), "1. keep the number");
});
