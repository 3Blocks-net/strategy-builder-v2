-- CreateTable
CREATE TABLE "VaultValueSnapshot" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "blockNumber" INTEGER,
    "asOf" TIMESTAMP(3) NOT NULL,
    "totalValueUsd" TEXT NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultValueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultValueSnapshot_vaultId_asOf_idx" ON "VaultValueSnapshot"("vaultId", "asOf");

-- AddForeignKey
ALTER TABLE "VaultValueSnapshot" ADD CONSTRAINT "VaultValueSnapshot_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
