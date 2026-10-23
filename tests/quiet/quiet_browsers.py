"""THE TEST BROWSERS MAKE NO SOUND (the owner, 23-Oct-2026: "whenever you test any thing i don't need to hear any voice
just check it"). Imported at Python's start-up for every browser suite (sitecustomize.py beside this file; scripts/run-e2e.ts
puts this folder on PYTHONPATH) and by the checking tools that launch a browser of their own (tests/originals_check/browse.py,
tests/qc_visual):

- every Chromium is launched muted (--mute-audio): Mitra's server voice and the app's chimes play to no speaker;
- every page speaks at volume 0: the browser's own voices (speechSynthesis) are Windows' voices, played past Chromium's mute,
  so each utterance is said silently - a voice test still sees its words, its language and its end.

Nothing else changes: the same pages, the same events, the same timings."""

QUIET_SPEECH = r"""(() => {
  try {
    const synth = window.speechSynthesis;
    if (!synth || synth.__dcrsQuiet) return;
    const speak = synth.speak.bind(synth);
    Object.defineProperty(synth, "speak", {
      configurable: true,
      writable: true,
      value: (u) => { try { u.volume = 0; } catch (e) {} return speak(u); },
    });
    synth.__dcrsQuiet = true;
  } catch (e) {}
})();"""


def _muted(kw):
    args = list(kw.get("args") or [])
    if "--mute-audio" not in args:
        args.append("--mute-audio")
    kw["args"] = args
    return kw


def install():
    """Once per process: the sync API's launches muted, its contexts and pages speaking silently."""
    try:
        from playwright.sync_api import Browser, BrowserType
    except Exception:  # (no Playwright here: nothing to quiet)
        return
    if getattr(BrowserType, "_dcrs_quiet", False):
        return

    launch = BrowserType.launch

    def quiet_launch(self, *a, **kw):
        return launch(self, *a, **_muted(kw))

    persistent = BrowserType.launch_persistent_context

    def quiet_persistent(self, *a, **kw):
        ctx = persistent(self, *a, **_muted(kw))
        ctx.add_init_script(QUIET_SPEECH)
        return ctx

    new_context = Browser.new_context

    def quiet_context(self, *a, **kw):
        ctx = new_context(self, *a, **kw)
        ctx.add_init_script(QUIET_SPEECH)
        return ctx

    new_page = Browser.new_page

    def quiet_page(self, *a, **kw):
        page = new_page(self, *a, **kw)
        page.add_init_script(QUIET_SPEECH)
        return page

    BrowserType.launch = quiet_launch
    BrowserType.launch_persistent_context = quiet_persistent
    Browser.new_context = quiet_context
    Browser.new_page = quiet_page
    BrowserType._dcrs_quiet = True


install()
