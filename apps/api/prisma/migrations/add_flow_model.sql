-- Migration: Adiciona tabela Flow para fluxos de atendimento do agente
-- Execute este SQL no painel do Supabase: SQL Editor → New query

CREATE TABLE IF NOT EXISTS "Flow" (
  "id"        TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "trigger"   TEXT NOT NULL,
  "script"    TEXT NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Flow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Flow_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Flow_agentId_idx" ON "Flow"("agentId");
