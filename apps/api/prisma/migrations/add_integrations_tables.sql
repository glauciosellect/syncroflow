-- Migration: tabelas base do motor de integrações e-commerce
-- Executar no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "Integration" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"    TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "accessToken"    TEXT,
  "refreshToken"   TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "shopId"         TEXT,
  "shopName"       TEXT,
  "shopUrl"        TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_workspaceId_platform_key"
  ON "Integration"("workspaceId", "platform");

ALTER TABLE "Integration"
  DROP CONSTRAINT IF EXISTS "Integration_workspaceId_fkey";

ALTER TABLE "Integration"
  ADD CONSTRAINT "Integration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Automation" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"   TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "trigger"       TEXT NOT NULL,
  "actions"       JSONB NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Automation"
  DROP CONSTRAINT IF EXISTS "Automation_workspaceId_fkey";

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

ALTER TABLE "Automation"
  DROP CONSTRAINT IF EXISTS "Automation_integrationId_fkey";

ALTER TABLE "Automation"
  ADD CONSTRAINT "Automation_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE;

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AutomationExecution" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "automationId" TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "triggerData"  JSONB NOT NULL,
  "result"       JSONB,
  "errorMsg"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutomationExecution"
  DROP CONSTRAINT IF EXISTS "AutomationExecution_automationId_fkey";

ALTER TABLE "AutomationExecution"
  ADD CONSTRAINT "AutomationExecution_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE;
