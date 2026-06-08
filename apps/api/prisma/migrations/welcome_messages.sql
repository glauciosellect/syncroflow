-- Cria tabela de fila de mensagens de boas-vindas
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "WelcomeMessage" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"  TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "messageIndex" INTEGER NOT NULL,
  "scheduledAt"  TIMESTAMP(3) NOT NULL,
  "sentAt"       TIMESTAMP(3),
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WelcomeMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WelcomeMessage"
  ADD CONSTRAINT "WelcomeMessage_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "WelcomeMessage_workspaceId_idx" ON "WelcomeMessage"("workspaceId");
CREATE INDEX IF NOT EXISTS "WelcomeMessage_status_scheduledAt_idx" ON "WelcomeMessage"("status", "scheduledAt");

-- Habilita autoCreateLead em todos os agentes existentes que ainda têm false
UPDATE "AgentConfig" SET "autoCreateLead" = true WHERE "autoCreateLead" = false;
