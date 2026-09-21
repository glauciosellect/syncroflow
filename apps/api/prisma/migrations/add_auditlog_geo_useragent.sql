-- Trilha de auditoria: adiciona metadados de dispositivo/localização a cada
-- entrada do AuditLog (User-Agent + geolocalização aproximada por IP), para
-- servir de comprovação em auditorias internas e LGPD.
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "geoCity" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "geoRegion" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "geoCountry" TEXT;

CREATE INDEX IF NOT EXISTS "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt" DESC);
