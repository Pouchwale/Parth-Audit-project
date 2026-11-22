"""The menu shows which document you are in: its own link is lit on the document
and on one of its records, a format with no link of its own (every QC format) gets
a row in its module, and a closed module opens when a document inside it is opened.

Run: npm run test:e2e -- tests/e2e_menu_current_document.py
"""
import sys
import time
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:8842"
EMAIL = f"e2e-menu-{int(time.time() * 1000)}@example.com"
PASSWORD = "PlaywrightQA123"
FAILURES = []


def check(label, condition, detail=None):
    print(f"[{'PASS' if condition else 'FAIL'}] {label}")
    if not condition:
        FAILURES.append(label)
        if detail is not None:
            print("    ", str(detail)[:400])


def go(page, address):
    page.goto(f"{BASE}/index.html#{address}")
    page.wait_for_timeout(500)
    got_it = page.locator("button:has-text('Got it')")
    if got_it.count():
        got_it.first.click()
        page.wait_for_timeout(200)


def lit(page):
    return page.evaluate(
        """() => [...document.querySelectorAll('#app-sidebar .app-nav a.active')].map((a) => ({
            href: a.getAttribute('href'), text: a.innerText.trim(),
            module: a.closest('.nav-module')?.dataset.module ?? null,
            seen: (() => { const r = a.getBoundingClientRect(), n = a.closest('.app-nav').getBoundingClientRect();
                           return r.top >= n.top - 1 && r.bottom <= n.bottom + 1; })(),
        }))"""
    )


def record_of(page, document_id):
    return page.evaluate(
        """async (id) => {
            for (const key of Object.keys(localStorage)) {
                if (!key.toLowerCase().includes('record')) continue;
                try {
                    const list = JSON.parse(localStorage.getItem(key));
                    const hit = Array.isArray(list) && list.find((r) => r && r.documentId === id);
                    if (hit) return hit.id;
                } catch {}
            }
            return null;
        }""",
        document_id,
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/index.html")
        page.click("text=Sign up", timeout=30000)
        page.fill("#signup-name", "Menu QA")
        page.fill("#signup-email", EMAIL)
        page.fill("#signup-password", PASSWORD)
        page.fill("#signup-confirm", PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_selector("#app-sidebar", timeout=30000)
        page.wait_for_timeout(1500)

        go(page, "/document/mnt-lux-level")
        now = lit(page)
        check("A document's own link is the one lit", len(now) == 1 and now[0]["href"] == "#/document/mnt-lux-level", now)
        check("The lit row is scrolled into view", bool(now) and now[0]["seen"], now)

        record = record_of(page, "mnt-lux-level")
        if record:
            go(page, f"/record/{record}")
            now = lit(page)
            check("Inside a record, its document stays lit", len(now) == 1 and now[0]["href"] == "#/document/mnt-lux-level", now)
        else:
            print("[SKIP] no stored record of mnt-lux-level to open")

        go(page, "/document/qc-inspection-pouching")
        now = lit(page)
        check("A format with no link gets a lit row with its name", len(now) == 1 and "·" in now[0]["text"], now)
        module = now[0]["module"] if now else None
        check("That row sits in the format's module", bool(module), now)

        go(page, "/dashboard")
        check("Leaving the document takes its row away", all("·" not in a["text"] for a in lit(page)), lit(page))

        page.evaluate("(m) => document.querySelector(`.nav-module[data-module=\"${m}\"] .nav-module-header`)?.click()", "Maintenance")
        page.wait_for_timeout(150)
        go(page, "/document/mnt-glass-breakage")
        now = lit(page)
        check("A closed module opens on entering its document", len(now) == 1 and now[0]["href"] == "#/document/mnt-glass-breakage", now)

        page.locator('.nav-module[data-module="Maintenance"] .nav-module-header').click()
        page.wait_for_timeout(200)
        check("Closing it again stays closed", page.locator('.nav-module[data-module="Maintenance"].closed').count() == 1)

        check("No page errors", not errors, errors)
        browser.close()
    print(f"\n{len(FAILURES)} failed")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
