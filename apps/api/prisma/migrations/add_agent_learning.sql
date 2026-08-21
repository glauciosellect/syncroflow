-- Migration: Adiciona tabela AgentLearning — memória de aprendizado contínuo do agente
-- Execute este SQL no painel do Supabase: SQL Editor → New query

CREATE TABLE IF NOT EXISTS "AgentLearning" (
  "id"                   TEXT NOT NULL,
  "workspaceId"          TEXT NOT NULL,
  "agentId"              TEXT NOT NULL,
  "content"              TEXT NOT NULL,
  "sourceType"           TEXT NOT NULL,
  "sourceConversationId" TEXT,
  "active"               BOOLEAN NOT NULL DEFAULT true,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentLearning_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentLearning_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentLearning_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AgentLearning_agentId_active_idx" ON "AgentLearning"("agentId", "active");
