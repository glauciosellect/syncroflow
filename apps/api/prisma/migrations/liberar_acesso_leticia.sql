-- Libera acesso ilimitado e gratuito ao workspace de leticiapimentel30@gmail.com
-- Rodar no banco do SyncroFlow (Postgres do Easypanel). Tabelas sem @@map: nomes em CamelCase com aspas.

-- 1) Conferir antes (deve retornar o workspace dela, plano TRIAL):
SELECT w.id, w.name, w.plan, w."trialEndsAt", w.credits
FROM "Workspace" w
JOIN "WorkspaceMember" m ON m."workspaceId" = w.id
JOIN "User" u ON u.id = m."userId"
WHERE u.email = 'leticiapimentel30@gmail.com';

-- 2) Aplicar
UPDATE "Workspace" w
SET plan = 'ENTERPRISE',
    "trialEndsAt" = NULL,
    credits = 999999999
FROM "WorkspaceMember" m
JOIN "User" u ON u.id = m."userId"
WHERE m."workspaceId" = w.id
  AND u.email = 'leticiapimentel30@gmail.com';
