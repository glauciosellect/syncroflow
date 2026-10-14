-- Campanhas (envio em massa controlado) + opt-out de contatos
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "optedOutAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "channelType" TEXT NOT NULL,
  "channelId" TEXT,
  "templateName" TEXT,
  "templateLanguage" TEXT,
  "templateParams" JSONB,
  "previewText" TEXT,
  "emailSubject" TEXT,
  "emailBody" TEXT,
  "tag" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "totalTargets" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Campaign_workspaceId_createdAt_idx" ON "Campaign"("workspaceId", "createdAt");

CREATE TABLE IF NOT EXISTS "CampaignRecipient" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");
CREATE INDEX IF NOT EXISTS "CampaignRecipient_contactId_idx" ON "CampaignRecipient"("contactId");
