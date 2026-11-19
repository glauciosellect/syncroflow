-- Listas de contatos (como as "Listas" do WhatsApp Business).
-- Rodar no SQL Editor do Supabase ANTES de implantar a API que usa as listas.
CREATE TABLE IF NOT EXISTS "ContactList" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#1565C0',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactList_workspaceId_name_key" ON "ContactList"("workspaceId", "name");

CREATE TABLE IF NOT EXISTS "ContactListMember" (
  "listId" TEXT NOT NULL REFERENCES "ContactList"("id") ON DELETE CASCADE,
  "contactId" TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("listId", "contactId")
);
CREATE INDEX IF NOT EXISTS "ContactListMember_contactId_idx" ON "ContactListMember"("contactId");
