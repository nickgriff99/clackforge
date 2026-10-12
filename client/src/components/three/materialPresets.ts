/**
 * Maps configurator option IDs (`shared/src/options.ts`) to three.js material
 * props - the one place that knows what a "walnut" or "anodized" OPTION ID
 * should look like rendered. Keeps `Case.tsx` itself generic (plain
 * `roughness`/`metalness` number overrides, no catalog/options knowledge) -
 * PROJECT_SPECS.md §8's "schema-driven" rule applies here too: a new case
 * material/finish is a data addition to this file, not a `Case.tsx` rewrite.
 *
 * Not every option id needs an entry - unknown/unset ids fall back to Phase
 * 3's original aluminum defaults.
 */
export interface CaseMaterialProps {
  roughness: number
  metalness: number
}

const DEFAULT_CASE_MATERIAL_PROPS: CaseMaterialProps = { roughness: 0.55, metalness: 0.35 }

/** Base look per `caseMaterial` option id. */
const MATERIAL_BASE: Record<string, CaseMaterialProps> = {
  "case-mat-aluminum": { roughness: 0.55, metalness: 0.35 },
  "case-mat-polycarbonate": { roughness: 0.2, metalness: 0.05 },
  "case-mat-walnut": { roughness: 0.75, metalness: 0 },
}

/** `caseFinish` nudges roughness on top of the material base; finish never changes metalness. */
const FINISH_ROUGHNESS_OFFSET: Record<string, number> = {
  "case-fin-anodized": -0.15,
  "case-fin-frosted": 0.2,
  "case-fin-matte": 0,
}

export function getCaseMaterialProps(materialOptionId?: string, finishOptionId?: string): CaseMaterialProps {
  const base = (materialOptionId && MATERIAL_BASE[materialOptionId]) || DEFAULT_CASE_MATERIAL_PROPS
  const offset = (finishOptionId ? FINISH_ROUGHNESS_OFFSET[finishOptionId] : undefined) ?? 0
  const roughness = Math.min(1, Math.max(0.05, base.roughness + offset))
  return { roughness, metalness: base.metalness }
}
