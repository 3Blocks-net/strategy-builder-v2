-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "automationId" INTEGER NOT NULL,
    "executorAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "gasCompAmount" TEXT,
    "gasCompToken" TEXT,
    "gasCompUsd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "feed" TEXT NOT NULL,
    "lastProcessedBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Execution_vaultId_blockTimestamp_idx" ON "Execution"("vaultId", "blockTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_txHash_logIndex_key" ON "Execution"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "IndexerCursor_feed_key" ON "IndexerCursor"("feed");

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
