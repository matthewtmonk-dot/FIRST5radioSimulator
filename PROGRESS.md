# Progress record

## 2026-10-23: rubric matched to the command board

- Initial Radio Report, Follow-Up Report and Unit Assignment checklist wording now follows the Engine Company Incident Command Board (Station 14 photos from Matt).
- The in-app command board shows the board's tactical priorities, communication tickets, objectives key, Mayday help order and checklist, and big box entry requirements.
- Follow-up examples give the accountability location by side, as the board lists it. Basement window well, look-out and walk-out are recognized.
- Saved rubrics from version 1 pick up the new wording but keep the instructor's weights.
- Still provisional: command transfer items (not on the board) and all scoring weights.

## 2026-10-22: first complete build (M1–M4)

**Done and tested**

- **M1 (engine):** seeded scenario templates, then branches, then instances. The engine is a state machine covering dispatch, arrival, the initial report, recon/360, unit arrivals and assignments, timed events, the BC's arrival, and transfer. It also has the radio language parser, the configurable rubric and vocabulary, grading, and the scenario validator.
- **M2 (exercise):**
  - **Exercise screen:** procedural building with smoke, fire and glow emitters, a radio log, a command board, and a coach panel (Practice only).
  - **Speech:** push-to-talk with local Whisper; browser speech recognition only if you opt in; typing always available.
  - **Simulated radio:** voice through the browser's text-to-speech.
- **M3 (review and tools):**
  - After-action review with all 10 items: overall score, four section scores, critical omissions, incorrect statements, done well, to improve, and an example transmission. It also offers side-by-side comparison, audio replay and verbosity highlighting.
  - History with trends and weak-area drills.
  - Settings, Help, and the Scenario Builder (photos with license tracking, anchors, image-prompt export, JSON import and export).
- **M4 (content and tests):**
  - **Content:** 12 scenario templates. Every template and branch validates, and the scripted run of each scores 98 to 100 with its own example wording.
  - **Unit tests:** 81 Vitest tests, including incomplete vs incorrect scoring, nothing-showing behavior, Test Mode secrecy and validator rejection.
  - **End-to-end:** 6 Playwright tests, including the 15-step acceptance flow, Test Mode with no leaks, nothing showing, incomplete vs incorrect, and phone layout.
  - **Offline:** a PWA service worker, verified offline against the production build.

**Simulated or provisional (disclosed in the app)**

- The rubric is **provisional**. Its checklist items are modeled on common Blue Card-style practice. It is not an official checklist and not certified. It will be updated from the Engine Company Incident Command Board photos once they are provided.
- Unit names, the dispatch center name and the response plan are sample values that you can change in Settings.
- The buildings and fire effects are drawn by the program. No photographs are included. The photo workflow is ready, but there are no photos yet.
- Radio voices use the browser's built-in text-to-speech.
- **Whisper could not be verified in the build environment**, because huggingface.co was blocked there. The download and transcription path is implemented, with clear errors, but still needs a check on a real machine.

**Open items**

- Test Whisper download and transcription on a real device and microphone.
- Add real building photos with licenses through the Scenario Builder.
