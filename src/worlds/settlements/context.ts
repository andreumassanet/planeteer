/** What the town builders share: the world's spec, the scenery context and the civilisation's style. */

import type { ArchitectureStyle, ColonyStyle, WorldSpec } from '../contract.ts';
import type { RoadNetwork } from '../roads.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import type { Terrain } from '../terrain.ts';

export interface TownContext {
  readonly spec: WorldSpec;
  readonly ctx: SceneryContext;
  readonly style: ArchitectureStyle;
  readonly colony: ColonyStyle | undefined;
  /** Whether towns stand on platforms over a cloud deck. */
  readonly deck: boolean;
  readonly terrain: Terrain;
  readonly network: RoadNetwork;
  /** The garden plants cheap enough for a grid town's planters and yards. */
  readonly smallPlants: readonly string[];
}
