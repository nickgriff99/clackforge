-- Phase 4a: extend CustomBuild for the configurator's extended BuildConfig
-- (shared/src/build.ts) — layout, accentKeys, configVersion.
--
-- Why: BuildConfigSchema now requires a `layout` field (the 3D model can't
-- render without one) and adds an optional `accentKeys` per-key recolor map
-- plus a `version` field for the future URL codec (Phase 4b). These need
-- durable columns so a saved/loaded CustomBuild round-trips the full
-- contract, not just the slot `selections` map.
--
-- Safe, zero-backfill: no route creates CustomBuild rows yet (the Phase 4
-- configurator UI doesn't exist until a later round wires it), so this
-- table has zero rows in every real deployment of this codebase today —
-- adding a NOT NULL `layout` column needs no default/backfill step.
--
-- Reversible: drop all three columns (see "Down migration" below).

-- AlterTable
ALTER TABLE "CustomBuild" ADD COLUMN "layout" TEXT NOT NULL;
ALTER TABLE "CustomBuild" ADD COLUMN "accentKeys" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "CustomBuild" ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 1;

-- Down migration (manual — Prisma migrate does not auto-generate down
-- scripts). To roll back:
--   ALTER TABLE "CustomBuild" DROP COLUMN "layout";
--   ALTER TABLE "CustomBuild" DROP COLUMN "accentKeys";
--   ALTER TABLE "CustomBuild" DROP COLUMN "configVersion";
