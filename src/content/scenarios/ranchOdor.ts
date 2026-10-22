import type { ScenarioTemplateInput } from '../../domain/scenario/schema';
import { haze, smoke } from '../helpers';

const nothingShowing = {
  id: 'arrival',
  description: 'Nothing showing from the exterior. Odor of smoke reported inside.',
  problem: 'nothing-showing' as const,
  acceptableProblems: ['nothing-showing' as const],
  acceptableStrategies: ['investigating' as const],
  conditionTerms: ['nothing showing', 'odor', 'smell of smoke'],
  emitters: [],
};

// Reference scenario 2 — nothing showing. One branch is a nonfire cause, the
// other a concealed wall fire that justifies a change to offensive.
export const ranchOdor: ScenarioTemplateInput = {
  id: 'ranch-odor-investigation',
  title: 'Odor of smoke, nothing showing',
  summary: 'Single-story residence, homeowner reports an odor of smoke. Investigation finds either an overheated air handler or a concealed electrical fire in a wall.',
  difficulty: 'easy',
  tags: ['residential', 'nothing showing', 'investigation', 'nonfire cause'],
  building: {
    archetype: 'ranch-1story',
    occupancy: 'residential',
    acceptableOccupancies: ['residential'],
    occupancyLabel: 'single-family residence',
    size: 'small',
    acceptableSizes: ['small', 'medium'],
    stories: 1,
    acceptableStories: [1],
    construction: 'Concrete block with stucco, wood truss roof',
    basement: false,
    basementRelevant: true,
    features: ['slab on grade', 'interior air handler closet'],
  },
  setting: { streetKind: 'residential' },
  dispatch: {
    nature: 'Odor investigation, residential',
    callerReport: 'Homeowner reports a smell of something burning inside the house. No visible smoke.',
    notes: ['Caller and her son are outside in the driveway.'],
  },
  occupants: { dispatchInfo: 'Caller and her son are outside.', status: 'all-out' },
  units: [
    { role: 'E2', type: 'engine', arrival: 85 },
    { role: 'L1', type: 'ladder', arrival: 130 },
    { role: 'BC', type: 'battalion', arrival: 250 },
  ],
  conditionStates: [
    nothingShowing,
    {
      id: 'cause-found',
      description: 'Overheated air handler blower motor. Unit shut down; light haze only.',
      problem: 'nothing-showing',
      acceptableProblems: ['nothing-showing', 'light-smoke'],
      acceptableStrategies: ['investigating'],
      conditionTerms: ['air handler', 'hvac', 'blower motor', 'a/c', 'nothing showing', 'no fire'],
      emitters: [],
    },
  ],
  initialCondition: 'arrival',
  findings: [
    {
      id: 'ahu',
      side: 'interior',
      text: 'Light haze in the hallway. Odor is strongest at the air handler closet; the blower motor is hot and smells of burnt insulation. No fire, no extension. Your crew shut the system down at the breaker.',
      kind: 'cause',
      reportable: 'required',
      match: [['air handler'], ['hvac'], ['blower'], ['motor'], ['a/c'], ['ac unit'], ['air conditioning']],
      revealedBy: 'investigate',
    },
    { id: 'ext-clear', side: 'general', text: 'Nothing showing on any side.', kind: 'conditions', reportable: 'recommended', match: [['nothing showing'], ['nothing', 'sides'], ['no smoke'], ['nothing evident']] },
    { id: 'slab', side: 'general', text: 'No basement — slab on grade.', kind: 'basement', reportable: 'required', match: [['no basement'], ['slab']] },
  ],
  recon: { kind: '360', label: 'Walk the 360', duration: 40, full360Possible: true },
  investigation: { label: 'Investigating the interior with your crew', duration: 60 },
  expectations: {
    initialActions: ['investigate'],
    actionLocationTerms: ['interior', 'inside', 'front door', 'house'],
    objectives: ['investigate'],
    resourceDecisions: ['level1', 'reduce', 'hold', 'continue'],
    criticalTasks: [],
    expectedTasks: [],
    followUpExpected: true,
    transferExpected: false,
    accountabilityExpected: false,
    transferPriorities: [],
  },
  taskOutcomes: {},
  events: [
    { id: 'cause', when: { after: 'investigateComplete', delay: 0 }, effects: [{ setCondition: 'cause-found' }] },
  ],
  examples: {
    initialReport: [
      '{DISPATCH}, {OWN} on scene, small one-story residential, nothing showing. {OWN} will be investigating. All other units Level One staging. {OWN} establishing {COMMAND}.',
    ],
    followUp: [
      '{COMMAND} to {DISPATCH}, 360 complete, nothing showing. Odor is from an overheated air handler motor, the unit is shut down, no extension. No basement. Remaining in investigating mode. Cancel all other units; {OWN} will remain to ventilate.',
    ],
    assignments: [],
    transfer: [],
  },
  explanations: {
    initialReport:
      'Nothing showing with an interior odor: report the building, "nothing showing", investigating mode, and hold incoming units at Level One (or reduce) until you know what you have. Do not cancel everyone before the cause is found, and do not declare offensive with nothing showing.',
    followUp:
      'Once the cause is found, the follow-up reports the 360, what was found, that there is no extension, and releases resources that are no longer needed.',
    assignments: 'No assignments are required. Units at Level One can be released once the cause is confirmed.',
    transfer: 'No transfer is expected for a nonfire cause that resolves in the first minutes.',
  },
  branches: [
    {
      id: 'hvac',
      weight: 2,
      label: 'Nonfire cause — overheated air handler',
      patch: { endWhen: 'followUp' },
    },
    {
      id: 'wall-fire',
      weight: 1,
      label: 'Concealed electrical fire in the Bravo-side bedroom wall',
      patch: {
        summary: 'Nothing showing on arrival. Investigation finds a concealed electrical fire in the Bravo-side bedroom wall that begins to show light smoke from the eaves.',
        endWhen: 'transfer',
        conditionStates: [
          nothingShowing,
          {
            id: 'wall-fire',
            description: 'Concealed fire in the Bravo-side bedroom wall, light smoke now showing from the Bravo-side eaves.',
            problem: 'light-smoke',
            acceptableProblems: ['light-smoke', 'working-fire'],
            acceptableStrategies: ['offensive'],
            location: { side: 'bravo', floor: 1, area: 'bedroom wall', areaTerms: ['bedroom', 'wall', 'bravo', 'outlet', 'eaves'] },
            conditionTerms: ['fire in the wall', 'wall fire', 'bedroom', 'light smoke'],
            emitters: [
              smoke('bravo', 'eaves-main', 0.3, { color: 'light-gray', pressure: 'lazy', spread: 1.2 }),
              smoke('bravo', 'win-b1', 0.25, { color: 'gray', pressure: 'lazy' }),
              haze('alpha', 'eaves-main', 0.2),
              smoke('alpha', 'roof-main', 0.12, { color: 'light-gray', pressure: 'lazy' }),
              smoke('charlie', 'eaves-main', 0.15, { color: 'light-gray', pressure: 'lazy' }),
            ],
          },
          {
            id: 'wall-out',
            description: 'Wall opened up, fire extinguished, no attic extension.',
            problem: 'light-smoke',
            acceptableProblems: ['light-smoke', 'nothing-showing'],
            acceptableStrategies: ['offensive', 'investigating'],
            location: { side: 'bravo', floor: 1, area: 'bedroom wall', areaTerms: ['bedroom', 'wall', 'bravo'] },
            conditionTerms: ['knocked down', 'fire is out', 'wall', 'no extension'],
            emitters: [smoke('bravo', 'win-b1', 0.12, { color: 'white', pressure: 'lazy' }), haze('alpha', 'eaves-main', 0.08)],
          },
        ],
        findings: [
          {
            id: 'wall',
            side: 'interior',
            text: 'Light smoke in the Bravo-side bedroom. The outlet on the exterior wall is charred and the wall is hot to the touch — fire inside the wall.',
            kind: 'cause',
            reportable: 'required',
            match: [['wall'], ['outlet'], ['bedroom'], ['electrical']],
            revealedBy: 'investigate',
          },
          {
            id: 'bravo-eaves',
            side: 'bravo',
            text: 'Light smoke from the soffit on the Bravo side.',
            kind: 'conditions',
            reportable: 'required',
            match: [['bravo', 'smoke'], ['bravo', 'soffit'], ['bravo', 'eave'], ['attic']],
          },
          { id: 'slab', side: 'general', text: 'No basement — slab on grade.', kind: 'basement', reportable: 'required', match: [['no basement'], ['slab']] },
        ],
        expectations: {
          initialActions: ['investigate'],
          actionLocationTerms: ['interior', 'inside', 'front door', 'house'],
          objectives: ['investigate'],
          resourceDecisions: ['level1', 'reduce', 'hold', 'continue'],
          criticalTasks: ['fireControl', 'checkExtension'],
          expectedTasks: ['waterSupply', 'utilities'],
          followUpExpected: true,
          transferExpected: true,
          accountabilityExpected: true,
          transferPriorities: ['attic', 'extension', 'overhaul', 'utilities'],
        },
        events: [
          {
            id: 'wall-shows',
            when: { after: 'investigateComplete', delay: 5 },
            effects: [
              { setCondition: 'wall-fire' },
              { radio: { from: 'OWN', text: '{OWN} engineer to {COMMAND}, I now have light smoke from the eaves on the Bravo side.' } },
            ],
            explanation: 'New information (fire in the wall) justifies changing from investigating to offensive and bringing staged units in.',
          },
          {
            id: 'wall-fallback',
            when: { at: 150 },
            effects: [{ setCondition: 'wall-fire' }, { reveal: 'bravo-eaves' }],
          },
        ],
        taskOutcomes: {
          fireControl: { duration: 90, report: '{unit} to {command}, wall is opened up and the fire is out.', effects: [{ setCondition: 'wall-out' }] },
          checkExtension: { duration: 70, report: '{unit} to {command}, attic checked over the Bravo bedroom, no extension.' },
        },
        examples: {
          initialReport: [
            '{DISPATCH}, {OWN} on scene, small one-story residential, nothing showing. {OWN} will be investigating. All other units Level One staging. {OWN} establishing {COMMAND}.',
          ],
          followUp: [
            '{COMMAND} to {DISPATCH}, 360 complete. Fire in the wall of the Bravo-side bedroom, light smoke from the Bravo eaves. No basement. Switching to offensive, {OWN} has fire control in the Bravo bedroom. Bring in all Level One units. Accountability is at {OWN}.',
          ],
          assignments: [
            { role: 'E2', task: 'waterSupply', text: '{E2}, from {COMMAND}, establish water supply to {OWN}.' },
            { role: 'L1', task: 'checkExtension', text: '{L1}, from {COMMAND}, check for extension in the attic over the Bravo-side bedroom, enter through the front door.' },
          ],
          transfer: [],
        },
        explanations: {
          initialReport: 'With nothing showing, the correct start is investigating mode with incoming units held at Level One.',
          followUp:
            'The investigation found fire in the wall. That is new information that justifies switching to offensive and committing the staged units. The follow-up must announce the strategy change and the location.',
          assignments: 'Once offensive: water supply, fire control in the bedroom wall, and checking the attic for extension.',
          transfer: 'Brief the chief on the wall fire, the strategy change, unit assignments, attic status, and remaining needs.',
        },
      },
    },
  ],
  endWhen: 'followUp',
};

