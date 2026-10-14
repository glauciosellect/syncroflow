-- Libera acesso ilimitado e gratuito ao workspace de ama.doacaojf@gmail.com
-- Rodar no banco do SyncroFlow (Supabase > SQL Editor). Só altera 1 workspace (o dessa conta).

-- 1) CONFERIR ANTES (deve retornar o workspace da AMA, plano TRIAL e trialEndsAt no passado):
SELECT w.id, w.name, w.plan, w."trialEndsAt", w.credits
FROM "Workspace" w
JOIN "WorkspaceMember" m ON m."workspaceId" = w.id
JOIN "User" u ON u.id = m."userId"
WHERE lower(u.email) = 'ama.doacaojf@gmail.com';

-- 2) APLICAR (só depois de conferir que o passo 1 mostrou o workspace certo, uma linha)
UPDATE "Workspace" w
SET plan = 'ENTERPRISE',
    "trialEndsAt" = NULL,
    credits = 999999999
FROM "WorkspaceMember" m
JOIN "User" u ON u.id = m."userId"
WHERE m."workspaceId" = w.id
  AND lower(u.email) = 'ama.doacaojf@gmail.com';
