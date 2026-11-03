-- Enable Row Level Security on every public table, deny-all (no policies).
--
-- Why: Supabase flags rls_disabled_in_public on all 13 tables. RLS is off,
-- so Supabase's auto-generated PostgREST API exposes every row to anyone
-- holding the project URL + anon key, even though this app never calls
-- supabase-js/PostgREST itself.
--
-- This app's own Prisma connection uses the `postgres.sxozbldnvcieczrmcvul`
-- role, which owns these tables. Postgres table owners bypass RLS by
-- default even with zero policies, so plain ENABLE ROW LEVEL SECURITY is
-- enough: it blocks PostgREST's anon/authenticated roles (non-owners,
-- always subject to RLS) while leaving Prisma's owner-role access
-- untouched. Do NOT add FORCE ROW LEVEL SECURITY here - FORCE applies RLS
-- to the owner too, and with zero policies that would make every Prisma
-- query return no rows, breaking the app.
--
-- No policies are created: legitimate access is server-side only (Prisma,
-- via the owner role), so deny-all for every other role is correct.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Variant" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CustomBuild" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "SavedBuild" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "GroupBuyDrop" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "DropReservation" ENABLE ROW LEVEL SECURITY;
