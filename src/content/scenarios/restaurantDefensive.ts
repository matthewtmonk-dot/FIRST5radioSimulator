import type { ScenarioTemplateInput } from '../../domain/scenario/schema';
import { fire, glow, smoke } from '../helpers';

// Freestanding restaurant: starts as a defensible offensive fire, then the
// truss roof fails over the kitchen. The officer must switch to defensive,
// get crews out and stop interior assignments.
export const restaurantDefensive: ScenarioTemplateInput = {
  id: 'restaurant-offensive-to-defensive',
  title: 'Restaurant fire, offensive to defensive',
  summary:
    'Freestanding restaurant with a lightweight truss roof. Kitchen fire extending into the roof space. A ladder company reports the roof sagging over the kitchen — the strategy must change to defensive.',
  difficulty: 'difficult',
  tags: ['commercial', 'working fire', 'strategy change', 'defensive', 'truss roof'],
  building: {
    archetype: 'restaurant',
    occupancy: 'commercial',
    acceptableOccupancies: ['commercial'],
    occupancyLabel: 'freestanding restaurant',
    size: 'medium',
    acceptableSizes: ['medium', 'large'],
    stories: 1,
    acceptableStories: [1],
    construction: 'Block walls, lightweight wood truss roof, large open dining room',
    basement: false,
    basementRelevant: false,
    features: ['kitchen on Charlie', 'grease hood', 'lightweight trusses', 'power lines along the rear'],
  },
  setting: { streetKind: 'commercial', placeName: 'Saltwater Grill' },
  dispatch: {
    nature: 'Commercial structure fire',
    callerReport: 'Restaurant manager reports a fire in the kitchen hood that spread into the ceiling. Everyone is out.',
    notes: ['Manager says all employees and customers are accounted for in the parking lot.'],
  },
  occupants: { dispatchInfo: 'Manager reports all employees and customers are out and accounted for.', status: 'all-out' },
  units: [
    { role: 'E2', type: 'engine', arrival: 70 },
    { role: 'L1', type: 'ladder', arrival: 95 },
    { role: 'E3', type: 'engine', arrival: 130 },
    { role: 'BC', type: 'battalion', arrival: 230 },
  ],
  conditionStates: [
    {
      id: 'arrival',
      description: 'Kitchen fire in the hood and ceiling over the kitchen (Charlie side). Dark smoke from the roof and the front hood exhaust; dining room smoky but tenable.',
      problem: 'working-fire',
      acceptableProblems: ['working-fire'],
      acceptableStrategies: ['offensive', 'defensive'],
      location: { side: 'charlie', floor: 1, area: 'kitchen', areaTerms: ['kitchen', 'rear', 'charlie', 'hood', 'ceiling', 'roof'] },
      conditionTerms: ['kitchen fire', 'fire in the kitchen ceiling', 'working fire'],
      emitters: [
        smoke('alpha', 'roof-main', 0.45, { color: 'dark-gray', pressure: 'moderate', spread: 1.2 }),
        smoke('alpha', 'hood-exhaust-a', 0.4, { color: 'dark-gray', pressure: 'pushing' }),
        smoke('alpha', 'entry', 0.2, { color: 'gray', pressure: 'lazy' }),
        smoke('charlie', 'hood-exhaust', 0.6, { color: 'black', pressure: 'pushing' }),
        glow('charlie', 'kitchen-door', 0.5),
        smoke('charlie', 'kitchen-door', 0.5, { color: 'dark-gray', pressure: 'pushing' }),
        smoke('charlie', 'eaves-main', 0.35, { color: 'dark-gray', pressure: 'moderate', spread: 1.6 }),
      ],
    },
    {
      id: 'roof-failing',
      description: 'Fire has taken the truss space over the kitchen and is running toward the dining room. Fire through the roof over the kitchen, roofline sagging. Interior operations are no longer safe.',
      problem: 'defensive',
      acceptableProblems: ['defensive', 'working-fire'],
      acceptableStrategies: ['defensive'],
      location: { side: 'charlie', floor: 1, area: 'kitchen', areaTerms: ['kitchen', 'roof', 'charlie', 'trusses', 'dining room'] },
      conditionTerms: ['fire through the roof', 'roof sagging', 'collapse', 'defensive'],
      emitters: [
        fire('alpha', 'roof-main', 0.45, { spread: 1.2 }),
        smoke('alpha', 'roof-main', 0.75, { color: 'black', pressure: 'pushing', spread: 1.8 }),
        smoke('alpha', 'eaves-main', 0.45, { color: 'dark-gray', pressure: 'pushing', spread: 2 }),
        smoke('alpha', 'entry', 0.4, { color: 'dark-gray', pressure: 'pushing' }),
        glow('alpha', 'dining-win-2', 0.35),
        fire('charlie', 'roof-main', 0.6, { spread: 1.4 }),
        fire('charlie', 'kitchen-door', 0.45),
        smoke('charlie', 'roof-main', 0.8, { color: 'black', pressure: 'pushing', spread: 2 }),
        smoke('charlie', 'eaves-main', 0.55, { color: 'black', pressure: 'pushing', spread: 2 }),
      ],
    },
  ],
  initialCondition: 'arrival',
  findings: [
    {
      id: 'kitchen',
      side: 'charlie',
      text: 'Fire showing at the kitchen door and heavy black smoke from the hood exhaust on the Charlie side.',
      kind: 'conditions',
      reportable: 'required',
      match: [['kitchen'], ['charlie', 'fire'], ['hood'], ['rear', 'fire']],
    },
    {
      id: 'rear-lines',
      side: 'charlie',
      text: 'Power lines run along the rear property line above the grease trap and dumpster.',
      kind: 'hazard',
      safety: true,
      reportable: 'required',
      match: [['power'], ['lines'], ['wires'], ['electric']],
    },
    {
      id: 'trusses',
      side: 'general',
      text: 'Manager confirms the roof is lightweight wood trusses over the whole building.',
      kind: 'hazard',
      safety: true,
      reportable: 'required',
      match: [['truss'], ['lightweight']],
      revealedBy: 'arrival',
    },
  ],
  recon: { kind: '360', label: 'Walk the 360', duration: 45, full360Possible: true },
  expectations: {
    initialActions: ['attack-line', 'defensive-ops'],
    actionLocationTerms: ['front door', 'main entrance', 'alpha', 'kitchen', 'dining room'],
    objectives: ['fireControl'],
    resourceDecisions: ['continue', 'upgrade'],
    criticalTasks: ['fireControl', 'waterSupply'],
    expectedTasks: ['rit', 'utilities', 'defensive', 'exposure'],
    followUpExpected: true,
    transferExpected: true,
    accountabilityExpected: true,
    transferPriorities: ['collapse zone', 'master streams', 'par', 'exposures'],
  },
  taskOutcomes: {
    fireControl: { duration: 300, report: '{unit} to {command}, we are making progress in the kitchen.' },
    defensive: { duration: 60, report: '{unit} to {command}, master stream in operation.' },
  },
  events: [
    {
      id: 'roof-report',
      when: { at: 140 },
      effects: [
        { setCondition: 'roof-failing' },
        {
          radio: {
            from: 'L1',
            text: '{L1} to {COMMAND}, from the Charlie side: fire through the roof over the kitchen and the roofline is sagging toward the dining room. Recommend everyone out and go defensive.',
            requiresAck: true,
          },
        },
      ],
      explanation: 'Lightweight trusses fail early. A sagging roofline with fire through the roof means interior crews come out and the strategy changes to defensive.',
    },
  ],
  examples: {
    initialReport: [
      '{DISPATCH}, {OWN} on scene, medium one-story commercial restaurant, working fire in the kitchen on the Charlie side. Everyone is reported out. {OWN} is stretching an attack line through the front entrance for fire control. Offensive. All other units continue in. {OWN} establishing {COMMAND}.',
    ],
    followUp: [],
    assignments: [
      { role: 'E2', task: 'waterSupply', text: '{E2}, from {COMMAND}, establish water supply to {OWN}.' },
      { role: 'L1', task: 'recon', text: '{L1}, from {COMMAND}, recon of the roof from the Charlie side and report conditions, do not commit to the roof.' },
      { role: 'E3', task: 'rit', text: '{E3}, from {COMMAND}, you are RIT on the Alpha side.' },
    ],
    transfer: [],
  },
  explanations: {
    initialReport:
      'A kitchen fire into the ceiling of a truss-roofed restaurant with everyone out: offensive is defensible early, defensive is also acceptable. Bring the commercial assignment.',
    followUp:
      'When conditions change for the worse, the strategy change is the most important transmission of the incident: switch to defensive, everyone out, PAR, and establish collapse zones.',
    assignments: 'After the change, no one goes back inside. Assign master streams and exposure protection, and keep RIT in place.',
    transfer: 'Brief the chief on the strategy change, PAR results, collapse zones, master stream positions and remaining needs.',
  },
  endWhen: 'transfer',
};
