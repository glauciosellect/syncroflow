-- Migration: add_crm_finance_marketing_audit_templates
-- Módulos M4 (CRM), M5 (Financeiro), M6 (Marketing), M8 (RBAC), M10 (Templates)

-- ─── Enum: MemberRole (adiciona MEMBER e VIEWER) ─────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEMBER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MemberRole')) THEN
    ALTER TYPE "MemberRole" ADD VALUE 'MEMBER';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VIEWER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MemberRole')) THEN
    ALTER TYPE "MemberRole" ADD VALUE 'VIEWER';
  END IF;
END $$;

-- ─── Tabela: CrmConnection ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CrmConnection" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"    TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "accessToken"    TEXT,
  "refreshToken"   TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "accountId"      TEXT,
  "accountName"    TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmConnection_workspaceId_platform_key" UNIQUE ("workspaceId", "platform"),
  CONSTRAINT "CrmConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CrmConnection_workspaceId_idx" ON "CrmConnection"("workspaceId");

-- ─── Tabela: FinanceConnection ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FinanceConnection" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId" TEXT NOT NULL,
  "platform"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "apiKey"      TEXT,
  "accountId"   TEXT,
  "accountName" TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceConnection_workspaceId_platform_key" UNIQUE ("workspaceId", "platform"),
  CONSTRAINT "FinanceConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FinanceConnection_workspaceId_idx" ON "FinanceConnection"("workspaceId");

-- ─── Tabela: MarketingConnection ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MarketingConnection" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"    TEXT NOT NULL,
  "platform"       TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'active',
  "accessToken"    TEXT,
  "refreshToken"   TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "apiKey"         TEXT,
  "accountUrl"     TEXT,
  "accountId"      TEXT,
  "accountName"    TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MarketingConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingConnection_workspaceId_platform_key" UNIQUE ("workspaceId", "platform"),
  CONSTRAINT "MarketingConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MarketingConnection_workspaceId_idx" ON "MarketingConnection"("workspaceId");

-- ─── Tabela: AuditLog ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspaceId"  TEXT NOT NULL,
  "userId"       TEXT,
  "action"       TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId"   TEXT,
  "metadata"     JSONB,
  "ipAddress"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- ─── Tabela: PublicTemplate ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PublicTemplate" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "title"              TEXT NOT NULL,
  "description"        TEXT,
  "category"           TEXT NOT NULL,
  "connectorsRequired" TEXT[] NOT NULL DEFAULT '{}',
  "workflowConfig"     JSONB NOT NULL,
  "usesCount"          INTEGER NOT NULL DEFAULT 0,
  "isFeatured"         BOOLEAN NOT NULL DEFAULT false,
  "isApproved"         BOOLEAN NOT NULL DEFAULT true,
  "createdByWorkspace" TEXT,
  "tags"               TEXT[] NOT NULL DEFAULT '{}',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublicTemplate_category_idx" ON "PublicTemplate"("category");
CREATE INDEX IF NOT EXISTS "PublicTemplate_isApproved_idx" ON "PublicTemplate"("isApproved");
CREATE INDEX IF NOT EXISTS "PublicTemplate_isFeatured_idx" ON "PublicTemplate"("isFeatured");
