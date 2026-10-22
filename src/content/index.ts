import type { ScenarioTemplateInput } from '../domain/scenario/schema';
import { beachHouse } from './scenarios/beachHouse';
import { convenienceStore } from './scenarios/convenienceStore';
import { duplex } from './scenarios/duplex';
import { gardenApartment } from './scenarios/gardenApartment';
import { highriseCondo } from './scenarios/highriseCondo';
import { ranchGarage } from './scenarios/ranchGarage';
import { ranchOdor } from './scenarios/ranchOdor';
import { restaurantDefensive } from './scenarios/restaurantDefensive';
import { smallOffice } from './scenarios/smallOffice';
import { stripCenter } from './scenarios/stripCenter';
import { townhome } from './scenarios/townhome';
import { twoStoryKitchen } from './scenarios/twoStoryKitchen';

/** Built-in scenario templates. Each yields many seeded variations. */
export const BUILT_IN_SCENARIOS: ScenarioTemplateInput[] = [
  ranchGarage,
  ranchOdor,
  twoStoryKitchen,
  convenienceStore,
  beachHouse,
  duplex,
  gardenApartment,
  smallOffice,
  townhome,
  stripCenter,
  highriseCondo,
  restaurantDefensive,
];
