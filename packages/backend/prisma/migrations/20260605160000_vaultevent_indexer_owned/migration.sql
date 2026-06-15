-- PEC-219: VaultEvent becomes indexer-owned (sole writer = the indexer).
-- Existing rows were written optimistically by the frontend and carry no
-- `logIndex` (mixed provenance). Clear them BEFORE adding the NOT NULL column
-- and the (txHash, logIndex) uniqueness, so the migration applies cleanly on a
-- non-empty table. The indexer re-derives this history from on-chain logs.
DELETE FROM "VaultEvent";

ALTER TABLE "VaultEvent" ADD COLUMN "logIndex" INTEGER NOT NULL;

CREATE UNIQUE INDEX "VaultEvent_txHash_logIndex_key" ON "VaultEvent"("txHash", "logIndex");

CREATE INDEX "VaultEvent_vaultId_blockTimestamp_idx" ON "VaultEvent"("vaultId", "blockTimestamp");
