import React, { useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiSearch } from "react-icons/fi";
import { PAGE_SIZE, findsPerson, pageNumbers, pageOf } from "../../engine/paging";

// ONE PAGE OF PEOPLE AT A TIME, WITH "FIND A PERSON" (the owner, 25-Oct-2026: "use pagination in user access because
// there are many id's ... low ending devices take time to load that page"; engine/paging.ts). A list longer than a page
// draws PAGE_SIZE rows and this bar above them: how many, the pages, and a box that looks through every account by name
// or sign-in. A list that fits on one page has no bar, and is drawn as before.

export interface Paged<T> {
  /** The rows of the page shown. */
  shown: T[];
  page: number;
  pages: number;
  from: number;
  to: number;
  /** The rows found (all of them, with nothing typed). */
  total: number;
  /** The rows in the list. */
  all: number;
  typed: string;
  setTyped: (typed: string) => void;
  setPage: (page: number) => void;
}

/** A list of people, a page at a time; what is typed finds through all of them and starts again at the first page. */
export function usePaged<T extends { name?: string | null; email?: string | null }>(items: readonly T[], size: number = PAGE_SIZE): Paged<T> {
  const [page, setPage] = useState(0);
  const [typed, setTypedRaw] = useState("");
  const found = useMemo(() => (typed.trim() ? items.filter((p) => findsPerson(p, typed)) : items), [items, typed]);
  const at = pageOf(found.length, page, size);
  const shown = useMemo(() => found.slice(at.from, at.to), [found, at.from, at.to]);
  const setTyped = (next: string) => {
    setTypedRaw(next);
    setPage(0);
  };
  return { shown, page: at.page, pages: at.pages, from: at.from, to: at.to, total: found.length, all: items.length, typed, setTyped, setPage };
}

/**
 * The bar over a paged list: "26–50 of 312 accounts", the pages, and Find a person. Nothing for a list that fits one page.
 * `foot`: the same pages under the list, without Find a person, so the next page is a click away at the end of a page;
 * a page chosen there brings the list's top into view.
 */
export function Pager<T>({ paged, list, noun, size = PAGE_SIZE, foot = false }: { paged: Paged<T>; list: string; noun: string; size?: number; foot?: boolean }) {
  if (paged.all <= size || (foot && paged.pages <= 1)) return null;
  const { page, pages, from, to, total, all, typed } = paged;
  const go = (p: number) => {
    paged.setPage(Math.min(Math.max(0, p), pages - 1));
    if (foot) document.querySelector(`[data-section="pager"][data-list="${list}"]`)?.scrollIntoView({ block: "start" });
  };
  return (
    <div className={`pager no-print${foot ? " pager-foot" : ""}`} data-section={foot ? "pager-foot" : "pager"} data-list={list} data-page={page + 1} data-pages={pages} data-total={total}>
      {!foot && (
      <label className="pager-find">
        <FiSearch size={13} aria-hidden="true" />
        <input
          type="search"
          className="input input-sm"
          data-action="find-person"
          placeholder="Find a person"
          aria-label={`Find a person among the ${all} ${noun}, by name or sign-in`}
          value={typed}
          onChange={(e) => paged.setTyped(e.target.value)}
        />
      </label>
      )}
      <span className="pager-count text-sm text-muted" data-field="pager-count" aria-live="polite">
        {total === 0 ? `Nobody matches “${typed.trim()}”` : `${from + 1}–${to} of ${total} ${noun}${total < all ? ` (of ${all})` : ""}`}
      </span>
      {pages > 1 && (
        <nav className="pager-pages" aria-label={`Pages of the ${noun}`}>
          <button type="button" className="btn btn-ghost btn-sm" data-action="page-prev" disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page">
            <FiChevronLeft size={14} />
          </button>
          {pageNumbers(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${p === page ? "btn-primary" : "btn-ghost"}`}
                data-action="page"
                data-page={p + 1}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p + 1}`}
                onClick={() => go(p)}
              >
                {p + 1}
              </button>
            )
          )}
          <button type="button" className="btn btn-ghost btn-sm" data-action="page-next" disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label="Next page">
            <FiChevronRight size={14} />
          </button>
        </nav>
      )}
    </div>
  );
}
