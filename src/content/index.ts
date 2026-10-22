import type { ScenarioTemplateInput } from '../domain/scenario/schema';
import { ranchGarage } from './scenarios/ranchGarage';
import { ranchOdor } from './scenarios/ranchOdor';
import { twoStoryKitchen } from './scenarios/twoStoryKitchen';

/** Built-in scenario templates. Each yields many seeded variations. */
export const BUILT_IN_SCENARIOS: ScenarioTemplateInput[] = [ranchGarage, ranchOdor, twoStoryKitchen];
