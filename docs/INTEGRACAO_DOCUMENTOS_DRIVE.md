# Entrega de documentos pelo agente (Google Drive)

## Como funciona
1. Cliente pede um documento no WhatsApp ("o projeto X está pronto? pode enviar?").
2. O agente pede o **número do contrato**. O telefone já é o do WhatsApp.
3. O código (não a IA) confirma telefone + contrato:
   - com `verifyUrl` configurada: pergunta ao sistema mãe (SyncroLex, GestorBIM, GestorAMA);
   - sem ela: só aceita se `contact.variables.contrato` for igual ao informado.
4. Busca **só** dentro da subpasta do contrato (`Contrato 1234/...`), dentro da pasta raiz compartilhada.
5. Pedido específico → envia o arquivo mais recente que casa com o **nome**. "Tem algum documento?" → lista os nomes, sem enviar.
6. Não achou → o agente responde conforme as próprias orientações.
7. 3 contratos errados → conversa vai para um humano. Tudo é registrado em `AuditLog` (`documents.*`).

## Configuração no servidor (uma vez)
1. Google Cloud: criar uma **conta de serviço**, gerar a chave JSON e ativar a **Google Drive API**.
2. Easypanel: variável `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` com o JSON (ou o JSON em base64).
3. Cada cliente compartilha a pasta dele (Leitor) com o e-mail da conta de serviço e cola o link em
   **Configurações > Documentos**.

## Contrato que cada sistema mãe precisa expor
`POST {verifyUrl}` com `Authorization: Bearer {token}`

Requisição:
```json
{ "event": "contract.verify", "phone": "5532999998888", "contract": "1234" }
```
Resposta (HTTP 200):
```json
{ "valid": true }
```
`valid: true` somente se o contrato existe **e** pertence ao cliente daquele telefone. Qualquer outra resposta
(ou erro) é tratada como não verificado.

## Segurança
- A conta de serviço só enxerga o que foi compartilhado com ela.
- Todo download passa por `assertInsideRoot`: o arquivo precisa estar sob a pasta raiz configurada.
- Não existe busca livre no Drive; a IA não tem ferramenta para isso.
- Verificação aprovada vale 30 minutos por contato.
