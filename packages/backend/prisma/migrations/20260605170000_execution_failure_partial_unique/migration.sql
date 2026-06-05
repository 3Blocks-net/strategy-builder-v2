-- PEC-219 #05: at most ONE open failure per (vaultId, automationId).
-- A resolved failure (resolvedAt IS NOT NULL) must be able to coexist with a
-- new open one for the same automation, so this is a PARTIAL unique index —
-- which Prisma's schema cannot express, hence this hand-written migration.
CREATE UNIQUE INDEX "ExecutionFailure_open_unique"
  ON "ExecutionFailure" ("vaultId", "automationId")
  WHERE "resolvedAt" IS NULL;
