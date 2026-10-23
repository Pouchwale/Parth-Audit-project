# Python imports this at start-up when its folder is on the path (scripts/run-e2e.ts sets PYTHONPATH for every browser
# suite): the test browsers make no sound (quiet_browsers.py, the owner, 23-Oct-2026).
import quiet_browsers  # noqa: F401
