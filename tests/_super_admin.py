"""The run's super admin, for the browser suites of the test server :8842 (REQUIREMENTS §116).

scripts/run-e2e.ts starts the test server with SEED_ACCOUNTS=0: the FIRST account signed up on it is the
super admin (role admin), every later one is staff. Since REQUIREMENTS §116 the System section - Reports,
Master Data, the Activity Log, the Performance Scorecard, Insights, Demo Mode - is the super admin's alone,
so a suite that opens one of those pages must be signed in as the run's super admin, whichever suite made
it and in whatever order the suites run.

The rule: a :8842 suite that needs the super admin BECOMES IT FIRST, through become_super_admin, before any
sign-up of its own. The first suite of a run to call it makes the account (tests/e2e_smoke.py, first in the
runner's order); every later suite signs in to it. Because every such suite calls it before any other
sign-up, the account is the first on the server in every order - the full run, a run resumed from a later
suite, a suite run alone - and so the super admin. A suite's own sign-ups are then staff, which is what a
check of "what staff see" needs.

A plain module beside the suites: `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))` then
`from _super_admin import become_super_admin`. (Python puts a script's own folder first on sys.path, so the
insert only matters when a suite is run with -I.)
"""

SUPER_ADMIN_EMAIL = "super.admin.qa@example.com"
SUPER_ADMIN_PASSWORD = "PlaywrightQA123"
SUPER_ADMIN_NAME = "Super Admin QA"
# The product server's seeded administrator (scripts/run-e2e.ts SEED_ACCOUNTS=1, PRODUCT_SEED_PASSWORD), on the
# database both servers share: once a product suite has run, it is the super admin of :8842's database too.
SEED_ADMIN_EMAIL = "admin@gpp.local"
SEED_ADMIN_PASSWORD = "SeedQA@2026"


def who_am_i(page):
    """The server's answer to /api/auth/me from the page, so it carries the session cookie."""
    return page.evaluate("() => fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json()).catch(() => null)")


def sign_out(page):
    """Signs out whoever is signed in, from the app or from the choose-your-own-password pop-up."""
    forced = page.locator("[data-action='sign-out-instead']")
    if forced.count():
        forced.first.click()
        page.wait_for_timeout(800)
        return
    btn = page.locator(".app-topbar button[title='Log Out']")
    if btn.count():
        # The briefing is a blocking overlay (a reload inside the morning or evening slot brings it back): clear it
        # first, or it swallows the click.
        got_it = page.locator("button:has-text('Got it')")
        if got_it.count():
            got_it.first.click()
            page.wait_for_timeout(200)
        btn.first.click()
        # Every log-out asks about the day's work first (REQUIREMENTS s72).
        page.wait_for_timeout(500)
        ok = page.locator("[data-action='logout-review-confirm']")
        if ok.count():
            ok.first.click()
        page.wait_for_selector("#login-email", timeout=30000)
        page.wait_for_timeout(300)


def dismiss_briefing(page, wait_ms=8000):
    """Clears the assistant's briefing, waiting for it to come up first: it is a blocking overlay that arrives
    once the day's records are prepared, which on a busy machine is seconds after the app opens."""
    try:
        page.wait_for_selector("button:has-text('Got it')", timeout=wait_ms)
    except Exception:
        pass
    for _ in range(3):
        got_it = page.locator("button:has-text('Got it')")
        if not got_it.count():
            break
        got_it.first.click()
        page.wait_for_timeout(200)


def _sign_in(page, base, email, password):
    """Signs in from the sign-in page; True once the app, or the forced first-password pop-up, is up."""
    page.goto(f"{base}/index.html")
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(300)
    page.fill("#login-email", email)
    page.fill("#login-password", password)
    page.click("button:has-text('Log In')")
    page.wait_for_selector(".app-sidebar, [data-action='sign-out-instead'], .auth-error:not([data-section='signed-out-notice'])", timeout=60000)
    page.wait_for_timeout(800)
    return bool(page.locator(".app-sidebar").count() or page.locator("[data-action='sign-out-instead']").count())


def promoted_by_seeded_administrator(page, base, dismiss=True):
    """A product suite ran before this one on the database both servers share, so its seeded administrator is
    the super admin and the account made here is staff: the seeded administrator makes it the super admin too
    (POST /api/users/:id/role, as Users & Access does), and the page signs in to it again. Returns the role it
    has then, or None when the seeded administrator is not on this server either."""
    sign_out(page)
    if not _sign_in(page, base, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD):
        print(f"[NOTE] {SEED_ADMIN_EMAIL} is not on this server either: {SUPER_ADMIN_EMAIL} stays staff")
        return None
    result = page.evaluate(
        """async (email) => {
             const list = await fetch('/api/users', { credentials: 'include' }).then((r) => r.json()).catch(() => null);
             const user = (((list || {}).users) || []).find((u) => String(u.email || '').toLowerCase() === email);
             if (!user) return { error: 'not listed' };
             const res = await fetch('/api/users/' + user.id + '/role', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin' }) });
             return { status: res.status, body: await res.json().catch(() => null) };
           }""",
        SUPER_ADMIN_EMAIL,
    )
    print(f"[NOTE] {SEED_ADMIN_EMAIL} (seeded by a product suite that ran first) makes {SUPER_ADMIN_EMAIL} the super admin: {result}")
    sign_out(page)
    if not _sign_in(page, base, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD):
        return None
    page.wait_for_timeout(600)
    if dismiss:
        dismiss_briefing(page)
    role = ((who_am_i(page) or {}).get("user") or {}).get("role")
    print(f"[NOTE] Signed in again as {SUPER_ADMIN_EMAIL} ({SUPER_ADMIN_NAME}): role {role}")
    return role


def become_super_admin(page, base, dismiss=True):
    """Signs the page in as the run's super admin account, making it when this is the first suite of the run
    to ask. Returns the role the server gives it ("admin" when it is the super admin), printed as a [NOTE];
    the caller fails its first check when it needed the super admin and did not get it."""
    page.goto(f"{base}/index.html")
    page.wait_for_timeout(600)
    if page.locator("[data-action='sign-out-instead']").count() or page.locator(".app-sidebar").count():
        sign_out(page)
    page.wait_for_selector("#login-email", timeout=60000)
    page.wait_for_timeout(300)
    page.fill("#login-email", SUPER_ADMIN_EMAIL)
    page.fill("#login-password", SUPER_ADMIN_PASSWORD)
    page.click("button:has-text('Log In')")
    # The app, or the sign-in's own refusal - not the signed-out notice the form may carry (LoginForm.tsx).
    REFUSED = ".auth-error:not([data-section='signed-out-notice'])"
    page.wait_for_selector(f".app-sidebar, {REFUSED}", timeout=60000)
    made = False
    if page.locator(".app-sidebar").count() == 0:
        # Not on this server yet: this suite is the first of the run to ask, so it makes the account - the
        # first sign-up on the server, which the server makes its super admin.
        page.click("text=Sign up")
        page.wait_for_selector("#signup-name", timeout=30000)
        page.fill("#signup-name", SUPER_ADMIN_NAME)
        page.fill("#signup-email", SUPER_ADMIN_EMAIL)
        page.fill("#signup-password", SUPER_ADMIN_PASSWORD)
        page.fill("#signup-confirm", SUPER_ADMIN_PASSWORD)
        page.click("button:has-text('Create Account')")
        page.wait_for_selector(f".app-sidebar, {REFUSED}", timeout=60000)
        made = True
    if page.locator(".app-sidebar").count() == 0:
        said = page.locator(REFUSED).first.inner_text().strip()[:200] if page.locator(REFUSED).count() else ""
        print(f"[NOTE] Could not sign in as {SUPER_ADMIN_EMAIL}: {said or 'no sidebar and no error shown'}")
        return None
    page.wait_for_timeout(1200)
    if dismiss:
        dismiss_briefing(page)
    role = ((who_am_i(page) or {}).get("user") or {}).get("role")
    print(f"[NOTE] {'Made' if made else 'Signed in as'} {SUPER_ADMIN_EMAIL} ({SUPER_ADMIN_NAME}): role {role}")
    if role != "admin":
        # A product suite ran before this one on the database both servers share (scripts/run-e2e.ts): its seeded
        # administrator is the super admin and the account made here is staff. The seeded administrator makes this
        # account the super admin too, so the account every suite expects is the super admin in every order, a run
        # resumed from a product suite included.
        role = promoted_by_seeded_administrator(page, base, dismiss) or role
    return role
