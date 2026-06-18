// Texto do Termo de Aceite exibido antes da confirmação de qualquer assinatura.
// Para atualizar o contrato: troque TERMS_TEXT e incremente TERMS_VERSION
// (ex: 'v2-2026-07'). Aceites antigos continuam registrados com a versão que assinaram.
export const TERMS_VERSION = 'v1-placeholder'

export const TERMS_TEXT = `[TEXTO DO TERMO DE ACEITE — SUBSTITUIR PELO CONTEÚDO OFICIAL]

Este é um texto temporário. Assim que o conteúdo definitivo do contrato for fornecido, substitua esta constante TERMS_TEXT e incremente TERMS_VERSION em apps/api/src/modules/billing/terms-content.ts.`
