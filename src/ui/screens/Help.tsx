import type { ReactNode } from 'react';
import { LEXICON } from '../../domain/language/lexicon';
import { Kbd, Panel } from '../components/ui';

export function Help() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">Using FIRST FIVE</h1>

        <Section title="Training modes">
          <Dl
            items={[
              ['Quick Drill', 'One transmission (initial report, assignment, follow-up, or transfer) with a scripted lead-in so you start right at the moment. Feedback immediately. About 30–60 seconds.'],
              ['Practice', 'The full first five minutes with a Hint button (coaching questions, not answers), an Example button, a live checklist on the Coach tab, feedback after every graded transmission, and Retry to say it again.'],
              ['Test', 'A random incident with no coaching at all. You see the scenario name, hidden facts and examples only in the after-action review.'],
            ]}
          />
        </Section>

        <Section title="During an exercise">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Hold <Kbd>Space</Kbd> (or the red button) to talk; release to stop. Your transcript appears in the box so you can correct recognition errors before
              sending. Both the original and corrected text are kept in the review.
            </li>
            <li>Typing works everywhere. Press <Kbd>Enter</Kbd> to transmit, <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> for a new line.</li>
            <li>Address units the way you would on the radio: “Engine 42 from Sandpiper Command, water supply, …”. Units acknowledge, ask for clarification when an order is incomplete, and report progress.</li>
            <li>Acknowledge benchmark and progress reports (“Command copies…”). Unacknowledged reports are repeated.</li>
            <li><b>Walk the 360</b> takes simulated time. Other sides of the building unlock as you reach them, and observations appear in the radio log.</li>
            <li><b>Next traffic</b> skips ahead to the next radio message or observation.</li>
            <li>When the chief arrives, tick <b>Face-to-face</b> to brief them in person, then confirm the transfer.</li>
          </ul>
        </Section>

        <Section title="How grading works">
          <p>
            Each transmission is parsed into facts (size, height, occupancy, problem, location, action, objectives, strategy, resources, command, assignments…)
            using phrase patterns that accept common alternate wording. Those facts are checked against the true scenario conditions and what you could actually
            know at that moment.
          </p>
          <Dl
            items={[
              ['✓ Correct / ≈ alternate', 'Full credit. Harmless wording differences are not penalized.'],
              ['○ Missing', 'No credit for that item.'],
              ['✕ Incorrect', 'Loses the item plus an extra penalty — wrong information costs more than missing information.'],
              ['Dangerous', 'A consequential error (for example, interior tasks under a defensive strategy) caps the section score.'],
              ['? Needs review', 'When the grader cannot reliably judge something (for example a low-confidence transcript), it flags it instead of guessing; the item is left out of the score.'],
              ['Verbosity', 'Clauses that carry no checklist information are underlined in the review. There is no fixed word limit.'],
            ]}
          />
          <p className="text-ink-400">
            The checklist, weights and penalties are editable under Settings → Rubric. The shipped checklist is provisional, taken from the build brief, and is
            not an official Blue Card, VCFR, or certified standard.
          </p>
        </Section>

        <Section title="Speech recognition">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>Local Whisper</b> (default) runs in the browser with Transformers.js. It uses the GPU through WebGPU when available, otherwise the CPU. The model
              (about 80 MB for base.en) downloads once from Hugging Face and is cached; after that it works offline and audio never leaves the computer.
            </li>
            <li>
              <b>Browser recognition</b> is optional. In Chrome and Edge it sends audio to the browser vendor's online service.
            </li>
            <li>If recognition fails or is slow, type. Nothing in the exercise depends on the microphone.</li>
            <li>Add corrections for words that are consistently misheard under Settings → Vocabulary.</li>
          </ul>
        </Section>

        <Section title="Scene images">
          <p>
            Without photos, each scenario is drawn by a procedural renderer: one building model produces all four sides, so the structure stays consistent, and
            the smoke and fire are particle effects placed at named points on that building (windows, doors, eaves, roof). The label on the image says
            “Procedural illustration · not a photograph”.
          </p>
          <p>
            In the Scenario Builder you can add your own photograph (or a licensed or separately generated image) for each side, place the same anchor points on
            the photo, and the same smoke and fire effects are composited over it. Image origin and license are recorded with the scenario. The builder can also
            export image-generation prompts with continuity instructions for every side.
          </p>
        </Section>

        <Section title="What is simulated">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>All radio traffic from other units, dispatch and the chief is generated by scenario rules and spoken by the browser's speech synthesizer.</li>
            <li>Units follow deterministic rules: they act only on assignments you actually gave, and report progress after a set time.</li>
            <li>Call signs, arrival times and response plans are configurable samples, not real district data. Addresses are fictional.</li>
            <li>Scores measure communication against the configured checklist. They are not a certification.</li>
          </ul>
        </Section>

        <Section title="Accepted-phrase concept ids">
          <p className="text-ink-400">Use these ids under Settings → Vocabulary → Extra accepted phrases.</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(LEXICON).map((k) => (
              <code key={k} className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-ink-200">
                {k}
              </code>
            ))}
          </div>
        </Section>

        <Section title="Data and privacy">
          <p>
            Everything is stored in this browser (IndexedDB and localStorage): sessions, scores, recordings and custom scenarios. There is no account and no
            server. Clearing the browser's site data removes it. Export history from the History page and scenarios from the Scenario Builder.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      <div className="space-y-2 p-4 text-sm leading-relaxed text-ink-200">{children}</div>
    </Panel>
  );
}

function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[180px_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-ink-100">{k}</dt>
          <dd className="text-ink-300">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
