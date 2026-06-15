-- CreateTable
CREATE TABLE "ProtocolFlow" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "amountUsd" TEXT,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtocolFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProtocolFlow_vaultId_token_idx" ON "ProtocolFlow"("vaultId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolFlow_txHash_logIndex_key" ON "ProtocolFlow"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "ProtocolFlow" ADD CONSTRAINT "ProtocolFlow_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
