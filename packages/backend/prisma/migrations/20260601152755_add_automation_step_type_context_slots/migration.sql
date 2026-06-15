-- CreateEnum
CREATE TYPE "StepCategory" AS ENUM ('CONDITION', 'ACTION');

-- AlterTable
ALTER TABLE "Vault" ADD COLUMN     "contextSlots" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "onChainId" INTEGER,
    "label" TEXT,
    "description" TEXT,
    "ownerOnly" BOOLEAN NOT NULL DEFAULT false,
    "editorState" JSONB,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "StepCategory" NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "afterExecutionSelector" TEXT,
    "abiFragment" JSONB NOT NULL,
    "paramSchema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Automation_vaultId_onChainId_key" ON "Automation"("vaultId", "onChainId");

-- CreateIndex
CREATE UNIQUE INDEX "StepType_contractAddress_selector_key" ON "StepType"("contractAddress", "selector");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "Vault"("id") ON DELETE CASCADE ON UPDATE CASCADE;
