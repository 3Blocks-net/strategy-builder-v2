-- CreateTable
CREATE TABLE "ExecutionFailure" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "automationId" INTEGER NOT NULL,
    "executorAddress" TEXT NOT NULL,
    "lastTxHash" TEXT,
    "errorMessage" TEXT NOT NULL,
    "failurePath" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "firstFailedAt" TIMESTAMP(3) NOT NULL,
    "lastFailedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutionFailure_vaultId_firstFailedAt_idx" ON "ExecutionFailure"("vaultId", "firstFailedAt");

-- AddForeignKey
ALTER TABLE "ExecutionFailure" ADD CONSTRAINT "ExecutionFailure_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
