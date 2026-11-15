"""A CHANGE CHECKED WITH A TEST ACCOUNT, THEN THE ACCOUNT DELETED (REQUIREMENTS §206).

The owner, 15-Nov-2026: "everytime you should create a testing id which will check whether the changes has been made or not
and after checking it should delete and if everything is fine then only and i don't want to see those id's in production".

Against the LOCAL test copy only (npm run dev:local, http://localhost:5173, its scratch database) - never the plant:
  1. the super admin (admin@gpp.local / Local@12345) makes a test account, verify-<time>@example.com, every module;
  2. the test account signs in, and for each document asked for (one of each module when none is): starts a record, types
     words into its boxes, reloads the page and finds them kept - and, with --print, prints it and finds them on paper;
  3. the super admin DELETES the test account (POST /api/users/:id/delete-test-account) - in a finally, so it goes even
     when a check fails - and its sign-in is refused afterwards.
The plant's server never holds such an account: it refuses to make one and deletes any at start-up (backend/index.ts).

Run:  python -I tests/verify_with_test_account.py                 (one document of every module)
      python -I tests/verify_with_test_account.py qc-viscosity hr-competence   (only these)
Exit status 0 only when every check passed and the account is gone.
"""
import os
import secrets
import sys
import time
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # run with python -I: this folder's helpers by path
from playwright.sync_api import sync_playwright  # noqa: E402

import check_all_documents as cad  # noqa: E402

ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
if urlparse(cad.BASE).hostname not in ALLOWED_HOSTS or urlparse(cad.BASE).port == 4100:
    sys.exit(f"Refused: {cad.BASE} is not the local test copy. Test accounts are never made on the plant.")

ONLY = [a for a in sys.argv[1:] if not a.startswith("--")]


def sign_in_as(page, email, password):
    page.goto(f"{cad.BASE}/")
    page.wait_for_timeout(800)
    page.keyboard.press("Escape")
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar", timeout=60000)
    page.wait_for_timeout(1200)
    cad.dismiss(page)


def by_module(docs):
    """Each module's documents that hold records, in the library's order: the first of each is checked, the next when it has no box of words."""
    out = {}
    for d in docs:
        if d["recordable"]:
            out.setdefault(d["module"], []).append(d)
    return out


def check_document(page, doc, idx):
    """New record, words typed, page reloaded: the words are kept. Answers (ok, words)."""
    cad.goto(page, "#/library", 1200)
    btn = page.locator(f"[data-action='new-record'][data-document='{doc['id']}']")
    if btn.count() == 0:
        return False, "New is not offered to the test account"
    btn.first.evaluate("el => el.click()")
    page.wait_for_timeout(1800)
    cad.dismiss(page)
    page.wait_for_selector("[data-print-doc]", timeout=15000, state="attached")
    page.wait_for_timeout(600)
    marks = cad.fill_marks(page, idx)
    if not marks:
        return True, "no box of words to type into (checked by its own tests)"
    page.wait_for_timeout(1500)
    page.reload()
    page.wait_for_timeout(2500)
    cad.dismiss(page)
    shown = page.evaluate("() => Array.from(document.querySelectorAll('[data-print-doc] input, [data-print-doc] textarea')).map(e => e.value).join(' ') + ' ' + (document.querySelector('[data-print-doc]') || {innerText: ''}).innerText")
    lost = [m for m in marks if m not in shown]
    return (not lost), (f"{len(marks)} words typed, all kept after a reload" if not lost else f"lost after a reload: {', '.join(lost)}")


def main():
    stamp = time.strftime("%Y%m%d%H%M%S")
    email = f"verify-{stamp}@example.com"
    password = secrets.token_urlsafe(14)
    results, account_id, deleted = [], None, False
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin = browser.new_context(viewport={"width": 1400, "height": 1000}).new_page()
        admin.route("**/translate_a/**", lambda r: r.abort())
        cad.sign_in(admin)
        made = admin.request.post(f"{cad.BASE}/api/users", data={"name": f"Verify {stamp}", "email": email, "password": password, "departments": []})
        if made.status != 201:
            sys.exit(f"The test account could not be made: {made.status} {made.text()[:200]}")
        account_id = made.json()["user"]["id"]
        print(f"Test account made: {email}")
        try:
            tester = browser.new_context(viewport={"width": 1400, "height": 1000}).new_page()
            tester.route("**/translate_a/**", lambda r: r.abort())
            sign_in_as(tester, email, password)
            docs = cad.list_documents(tester)
            if ONLY:
                chosen = [d for d in docs if d["id"] in ONLY]
                groups = [[d] for d in chosen]
                if len(chosen) < len(ONLY):
                    results.append((False, "(documents)", f"not found for the test account: {sorted(set(ONLY) - {d['id'] for d in chosen})}"))
            else:
                groups = list(by_module(docs).values())
            i = 0
            for group in groups:
                for tries, doc in enumerate(group[:4]):
                    i += 1
                    try:
                        ok, words = check_document(tester, doc, 900 + i)
                    except Exception as e:  # noqa: BLE001
                        ok, words = False, f"{type(e).__name__}: {str(e)[:160]}"
                    if ok and words.startswith("no box") and tries < len(group[:4]) - 1:
                        continue  # the module's next document, which has words to type
                    results.append((ok, f"{doc['formatNo']} {doc['id']}", words))
                    print(f"[{'PASS' if ok else 'FAIL'}] {doc['module']} | {doc['formatNo']} | {doc['id']} | {words}")
                    break
            tester.context.close()
        finally:
            gone = admin.request.post(f"{cad.BASE}/api/users/{account_id}/delete-test-account")
            deleted = gone.status == 200
            again = admin.request.post(f"{cad.BASE}/api/auth/login", data={"email": email, "password": password})
            refused = again.status in (401, 403, 404)
            print(f"Test account deleted: {'yes' if deleted else 'NO (' + str(gone.status) + ')'}; its sign-in now {'refused' if refused else 'STILL WORKS'}")
            deleted = deleted and refused
            browser.close()
    failed = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed; the test account is {'gone' if deleted else 'NOT gone'}.")
    sys.exit(0 if not failed and deleted else 1)


if __name__ == "__main__":
    main()
