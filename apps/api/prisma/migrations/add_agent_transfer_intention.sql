-- Adiciona suporte a transferência entre agentes nas intenções
ALTER TYPE "IntentionAction" ADD VALUE IF NOT EXISTS 'AGENT_TRANSFER';

ALTER TABLE "Intention" ADD COLUMN IF NOT EXISTS "transferToAgentId" TEXT;
