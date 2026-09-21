import { prisma } from './prisma'

// Busca de contato "solta": ignora maiúsculas/minúsculas E acentos (ex.: digitar
// "joao" acha "João"). O filtro nativo do Prisma (`contains`, `mode: insensitive`)
// só resolve maiúscula/minúscula — acento continua sendo comparado à risca, então
// qualquer palavra com acento que o usuário digite sem ele (ou vice-versa) não
// batia com nada. Usa a extensão `unaccent` do Postgres via SQL raw porque não
// existe um filtro equivalente na API do Prisma.
export async function findContactIdsBySearch(workspaceId: string, search: string): Promise<string[]> {
  const term = `%${search}%`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Contact"
    WHERE "workspaceId" = ${workspaceId}
      AND (
        extensions.unaccent(name) ILIKE extensions.unaccent(${term})
        OR phone ILIKE ${term}
        OR (email IS NOT NULL AND extensions.unaccent(email) ILIKE extensions.unaccent(${term}))
      )
  `
  return rows.map((r) => r.id)
}
