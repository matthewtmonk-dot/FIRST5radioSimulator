# FIRST FIVE: fireground radio command simulator

FIRST FIVE is browser-based practice for the first-arriving company officer's first five minutes. The officer arrives on a simulated incident, gives the initial radio report, walks the 360 and gives a follow-up, assigns arriving units, and transfers command to the battalion chief. After that, an after-action review scores each transmission.

It runs entirely in your browser. There is no server, no account, no subscription and no API key. Your recordings, scores and settings stay on your device, in the browser's storage.

> **Training aid only.** The initial report, follow-up and unit assignment checklist items follow the wording of the Engine Company Incident Command Board (Station 14 copy). The command transfer items are not on that board and are **provisional**, and so are the scoring weights. You can edit all of it under Settings → Rubric. It is not an official Blue Card product, and it is not certified or endorsed by any agency. Addresses, businesses and incidents are fictional. Unit names and the response plan are samples that you set under Settings → Response plan.

## Open it

**Online:** https://matthewtmonk-dot.github.io/FIRST5radioSimulator/ works in Chrome or Edge on a computer, phone or tablet, with nothing to install. A new copy is published automatically on every push to `main`. The first time, GitHub Pages has to be switched on: in the repository, open Settings → Pages and set Source to "GitHub Actions".

## Quick start (run it on your own computer)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # opens http://localhost:5173
```

To install it on a phone, tablet or laptop as an app that works offline:

```bash
npm run build
npm run preview    # serves the built app on http://localhost:4173
```

You can host the `dist/` folder on any static web host, such as GitHub Pages, Netlify or a department intranet. The service worker caches the app after the first visit, so it keeps working without a connection.

## Modes

| Mode | What it does |
|---|---|
| **Practice** | Hint, an example transmission, a live checklist, and feedback after every transmission, with **Retry**. |
| **Test** | No coaching. The scenario is random and its name stays hidden until the review. You get one final score, the full transcript, audio replay, and a side-by-side comparison with a preferred version. |
| **Quick Drill** | 30 to 60 seconds on one transmission: initial report, follow-up, an assignment, or a command transfer. |
| **Full First Five** | Dispatch through transfer of command. Practice and Test both run the full sequence. |

## Speech

- **Push-to-talk**: hold the button, or the key set in Settings (Space by default).
- **Whisper (default)**: a free speech-to-text model that runs on your own device. The first time you use it, the browser downloads the model once from huggingface.co (base.en, about 80 MB). After that it works offline. Audio is never uploaded. To avoid that download entirely, put the model files under `public/models/<model id>/`.
- **Browser speech recognition**: off by default. Chrome and Edge send audio to the browser vendor's servers, so you have to turn it on yourself in Settings.
- **Typing**: you can always type a transmission instead.

In Practice Mode you can fix a transcript before it is graded. In Test Mode the review keeps both the original transcript and any correction.

## How it is graded

Each transmission is checked against the configurable rubric. Every checklist item gets one of these results:

- **correct**
- **acceptable alternate**
- **partial**
- **missing** (left out)
- **incorrect** (wrong, which costs more than leaving it out)
- **needs instructor review** (low-confidence speech)

On top of that, a **dangerous** statement caps the score, for example calling a working fire "nothing showing". The review also flags **verbose** clauses that carried no checklist information. Instructors can change section weights, the incorrect-item penalty, the dangerous cap, the command-naming convention and each item's weight.

## Scenarios

There are 12 built-in templates. Each one is seeded, so the same seed always produces the same incident, and some have branches that play out differently each time:

- ranch house with attached-garage fire;
- odor investigation with nothing showing;
- two-story house kitchen fire;
- elevated beach house;
- duplex with an attached exposure;
- townhome with an occupant reported inside;
- garden apartment;
- high-rise condo, upper floor;
- strip center where the caller names the wrong store;
- dumpster fire against a convenience store;
- small office with a delayed water supply;
- restaurant that goes from offensive to defensive.

The **Scenario Builder** edits any scenario. It covers:

- building facts, dispatch and units;
- conditions and smoke and fire effects, with a live preview;
- 360 findings and timed events;
- the checklist wording.

It also handles:

- **Photos:** upload your own building photos, record each one's license and credit, and place the anchors for smoke and fire.
- **Image prompts:** export prompts for an image generator.
- **Import and export:** scenario packs as JSON.

Every scenario is validated before it can be used.

**About the visuals:** the buildings, smoke and fire are drawn by the program. They are not photographs. A scenario shows a photograph only if you add one in the Builder.

## Development

```bash
npm test           # unit tests (Vitest): grading, nothing-showing, Test Mode secrecy, validator, all 12 scenarios
npm run e2e        # Playwright end-to-end acceptance test (starts the dev server)
npm run typecheck
```

If Playwright's own browser is not installed, either run `npx playwright install chromium` or set `PLAYWRIGHT_CHROMIUM=/path/to/chrome`.

Code map:

| Path | Contents |
|---|---|
| `src/domain/engine` | State-machine engine |
| `src/domain/grading` | Grading |
| `src/domain/language` | Radio language parsing and vocabulary |
| `src/domain/scenario` | Scenario schema, instances, validator |
| `src/content/scenarios` | Built-in scenarios |
| `src/render` | Building and effects renderer, image prompts |
| `src/transcription` | Whisper worker and browser speech |
| `src/audio` | Simulated radio voice (the browser's text-to-speech) |
| `src/ui` | Screens |

See [PROGRESS.md](PROGRESS.md) for what is done, what is simulated, and what is still open.
