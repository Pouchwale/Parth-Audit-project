"""F/HR/20: each answer on the 7-to-1 scale is a tick box, no circle, on the screen, in print and in the Word and Excel
downloads. A tick is kept after a reload, and one line holds one answer.

Run: npm run test:e2e -- tests/e2e_hr20_ticks.py
Set HR20_OUT to a folder to keep the picture, the PDF and the downloads.
"""
import os
import re
import sys
import tempfile
import time
import zipfile
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
EMAIL = f"e2e-hr20-{int(time.time() * 1000)}@example.com"
PASSWORD = "PlaywrightQA123"
OUT = os.environ.get("HR20_OUT") or tempfile.mkdtemp(prefix="hr20-")
FAILURES = []


def check(label, condition, detail=None):
    print(f"[{'PASS' if condition else 'FAIL'}] {label}")
    if not condition:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:500])


def clear(page):
    got_it = page.locator("button:has-text('Got it')")
    if got_it.count():
        got_it.first.click()
        page.wait_for_timeout(200)


def go(page, address):
    page.goto(f"{BASE}/index.html#{address}")
    page.wait_for_timeout(1000)
    clear(page)


def form_id(page):
    return page.evaluate(
        """() => {
            for (const key of Object.keys(localStorage)) {
                if (!key.toLowerCase().includes('record')) continue;
                try {
                    const list = JSON.parse(localStorage.getItem(key));
                    const hit = Array.isArray(list) && list.find((r) => r && r.documentId === 'hr-psc-survey' && !['Submitted', 'Verified'].includes(r.status));
                    if (hit) return hit.id;
                } catch {}
            }
            return null;
        }"""
    )


def marks(page):
    return page.evaluate(
        """() => {
            const picks = [...document.querySelectorAll('[data-print-doc] .pt-pick, .pt-table .pt-pick')];
            const unique = [...new Set(picks)];
            const lines = new Map();
            let outside = 0;
            for (const p of unique) {
                const tr = p.closest('tr');
                if (p.classList.contains('is-on')) lines.set(tr, (lines.get(tr) ?? 0) + 1);
                const a = p.getBoundingClientRect(), b = p.closest('td').getBoundingClientRect();
                if (a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5) outside++;
            }
            const on = unique.find((p) => p.classList.contains('is-on'));
            return {
                all: unique.length,
                rings: unique.filter((p) => p.classList.contains('pt-pick-ring')).length,
                checks: unique.filter((p) => p.classList.contains('pt-pick-check')).length,
                most: Math.max(0, ...lines.values()),
                outside,
                tick: on ? getComputedStyle(on, '::before').content : '',
                outline: on ? getComputedStyle(on).outlineStyle : '',
            };
        }"""
    )


def words_of(path):
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.endswith(".xml")]
        parts = {n: z.read(n).decode("utf-8", "replace") for n in names}
    body = "".join(v for n, v in parts.items() if n == "word/document.xml" or n == "xl/sharedStrings.xml" or n.startswith("xl/worksheets/sheet"))
    drawn = sum(len(re.findall(r'prst="ellipse"|<v:oval', v)) for v in parts.values())
    return body, drawn


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 1000}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/index.html")
        page.click("text=Sign up", timeout=30000)
        page.fill("#signup-name", "Tick QA")
        page.fill("#signup-email", EMAIL)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_selector("#app-sidebar", timeout=30000)
        page.wait_for_timeout(1500)
        clear(page)

        go(page, "/hr/psc-survey")
        record = form_id(page)
        if not record:
            page.locator("button", has_text=re.compile(r"^\s*\+?\s*New")).first.click()
            page.wait_for_timeout(1000)
            clear(page)
            found = re.search(r"#/record/([^/?]+)", page.url)
            record = found.group(1) if found else form_id(page)
        check("An open F/HR/20 form is found", bool(record), page.url)
        if not record:
            browser.close()
            sys.exit(1)
        go(page, f"/record/{record}")
        page.wait_for_selector(".pt-table .pt-pick", timeout=15000)

        now = marks(page)
        check("All 105 answers are tick boxes", now["checks"] == 105 and now["all"] == 105, now)
        check("No circle is left", now["rings"] == 0, now)
        check("Each tick box stays inside its cell", now["outside"] == 0, now)

        line = page.locator(".pt-table tr", has=page.locator(".pt-pick")).nth(2)
        line.locator('.pt-pick[data-pick^="3"]').click()
        page.wait_for_timeout(1200)
        check("Clicking an answer ticks it", line.locator('.pt-pick[data-pick^="3"].is-on').count() == 1)
        check("One line holds one answer", line.locator(".pt-pick.is-on").count() == 1, line.locator(".pt-pick.is-on").count())
        now = marks(page)
        check("The chosen answer shows a tick and no circle", "✓" in now["tick"] and now["outline"] == "none", now)

        page.reload()
        page.wait_for_selector(".pt-table .pt-pick", timeout=15000)
        page.wait_for_timeout(800)
        clear(page)
        line = page.locator(".pt-table tr", has=page.locator(".pt-pick")).nth(2)
        check("The tick is kept after a reload", line.locator('.pt-pick[data-pick^="3"].is-on').count() == 1)
        page.locator(".pt-table", has=page.locator(".pt-pick")).first.screenshot(path=os.path.join(OUT, "hr20-screen.png"))

        page.emulate_media(media="print")
        check("In print the chosen answer still shows a tick", "✓" in marks(page)["tick"], marks(page))
        page.pdf(path=os.path.join(OUT, "hr20-print.pdf"), format="A4", print_background=True, prefer_css_page_size=True)
        page.emulate_media(media="screen")

        buttons = page.locator("[data-action^='download-document']")
        formats = [buttons.nth(i).get_attribute("data-format") for i in range(buttons.count())]
        check("F/HR/20 offers Word and Excel", any(f in ("docx", "doc") for f in formats) and any(f in ("xlsx", "xls") for f in formats), formats)
        for i, fmt in enumerate(formats):
            with page.expect_download() as dl:
                buttons.nth(i).click()
            path = os.path.join(OUT, f"hr20.{fmt}")
            dl.value.save_as(path)
            body, drawn = words_of(path)
            ticked, empty = body.count("☑"), body.count("☐")
            print(f"     {fmt}: ticked {ticked}, empty {empty}, drawn circles {drawn}")
            check(f"{fmt}: tick boxes on all 105 answers", ticked + empty == 105 and ticked >= 1, (ticked, empty))
            check(f"{fmt}: no circle and no bracketed answer", drawn == 0 and not re.search(r">\s*\([1-7]\)\s*<", body), drawn)

        check("No page errors", not errors, errors)
        browser.close()
    print(f"\nFiles: {OUT}")
    print(f"{len(FAILURES)} failed")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
