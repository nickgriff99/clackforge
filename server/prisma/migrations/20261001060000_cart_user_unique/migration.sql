-- Phase 5b: Cart.userId becomes unique (was a plain index).
--
-- Why: the new cart-sync routes (GET /api/cart and friends) find-or-create a
-- Cart row by userId. Without a DB-level unique constraint, two
-- near-simultaneous first requests for the same signed-in user (e.g. two
-- tabs opening /cart at once right after login) could both see "no cart
-- yet" and each insert one, leaving a user with two Cart rows and no
-- deterministic "the" cart. Postgres unique indexes treat every NULL as a
-- distinct value, so this does NOT limit guest carts (userId IS NULL) to
-- one each — only signed-in users are capped at one Cart row.
--
-- Reversible: drop the unique index and recreate the old plain index to
-- roll back (see "down" block in the comment at the bottom of this file).

-- DropIndex
DROP INDEX "Cart_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- Down migration (manual — Prisma migrate does not auto-generate down
-- scripts). To roll back:
--   DROP INDEX "Cart_userId_key";
--   CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");
