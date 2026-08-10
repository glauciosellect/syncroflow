'use client'
import { createContext, useContext, useState, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Criar seu Agente de IA',
    content: 'Vá em **Agentes** no menu lateral e clique em **Novo Agente**. Escolha um nome (ex: Jarbas), a função (ex: Atendimento ao Cliente ou Vendas) e o objetivo do agente. Depois preencha o nome e a descrição da sua empresa — esse resumo é usado pelo agente para se contextualizar sobre o seu negócio em toda conversa.',
  },
  {
    step: 2,
    title: 'Conectar seu WhatsApp',
    content: 'Vá em **Configurações → Canais** e clique em **WhatsApp**. Dê um nome à conexão, clique em Conectar e escaneie o QR Code com o WhatsApp Business do seu celular. Você também pode conectar Instagram e Facebook do mesmo jeito, se quiser atender por lá também.',
  },
  {
    step: 3,
    title: 'Vincular Agente ao Canal',
    content: 'Ainda em **Canais**, após conectar o WhatsApp (ou Instagram/Facebook), use o seletor de **Agente vinculado** para escolher qual agente vai atender aquele número/página. Clique no ícone de salvar. Sem esse vínculo, as mensagens chegam mas nenhum agente responde automaticamente.',
  },
  {
    step: 4,
    title: 'Perfil do Agente — comportamento e tom de voz',
    content: 'Na aba **Perfil** do agente você define como ele se comporta: nome, função, tom de voz (formal, normal ou casual), e o **campo de comportamento** onde você escreve as regras da conversa — como ele deve se apresentar, quando transferir para humano, o que nunca deve fazer. É aqui que fica a "personalidade" do agente. Preencha também a **Descrição da empresa** — um resumo curto do seu negócio que ajuda o agente a se situar.',
  },
  {
    step: 5,
    title: 'Treinamentos — o que o agente sabe',
    content: 'Na aba **Treinamentos**, você ensina o agente sobre seu negócio: produtos/serviços, preços e condições, horário de funcionamento, perguntas frequentes e políticas importantes. Cole textos direto no campo **Adicionar Texto** (até 50.000 caracteres) ou aponte para o seu site em **Adicionar Website**, e o agente lê e aprende o conteúdo automaticamente. Quanto mais completo, melhor e mais preciso o atendimento.',
  },
  {
    step: 6,
    title: 'Intenções — atalhos inteligentes',
    content: 'Na aba **Intenções**, você cria atalhos que disparam uma ação automática assim que o agente identifica o que o cliente quer — sem precisar gerar uma resposta nova toda vez. Existem dois tipos: **Mensagem fixa** (sempre responde com o mesmo texto — ótimo para horário, endereço, preço, transferência para humano) e **Google Calendar** (agenda, consulta ou cancela horário direto na agenda, se estiver conectada). No campo "Quando acionar", descreva as situações/palavras-chave que identificam aquela intenção — quanto mais específico, melhor a detecção.',
  },
  {
    step: 7,
    title: 'Fluxos de Atendimento — scripts por situação',
    content: 'Na aba **Fluxos**, você define como o agente deve conduzir a conversa em diferentes cenários — por exemplo, um fluxo para "Lead novo" (apresentação, escuta, qualificação, solução, próximo passo) e outro para "Cliente existente" (saudação direta, sem se reapresentar). Cada fluxo tem um gatilho ("quando acionar") e um script de atendimento com etapas numeradas que a IA segue durante a conversa.',
  },
  {
    step: 8,
    title: 'IA Tools — ferramentas que o agente pode usar',
    content: 'Na aba **IA Tools**, ative as ferramentas que o agente pode executar durante a conversa, além de só responder texto: **Consultar Pedido** (status de compra via Nuvemshop/Shopify), **Verificar Estoque** (disponibilidade de produtos), **Gerar Link de Pagamento** (cobrança PIX via Asaas), **Agendar Horário** (cria evento real na sua Google Calendar, checando conflitos antes), **Criar Lead** (registra automaticamente nome/telefone/interesse no CRM interno) e **Transferir para Humano** (escala a conversa quando necessário). Ligue só as que fazem sentido pro seu negócio — cada uma pode exigir uma integração conectada (ex: Nuvemshop, Asaas, Google Calendar).',
  },
  {
    step: 9,
    title: 'Configurações do Agente',
    content: 'Na aba **Configurações**, ajuste o comportamento fino do agente: **Transferir para humano** (permite escalar a conversa), **Usar emojis** (moderação visual nas respostas), **Assinar nome nas respostas** (repetir o nome do agente a cada mensagem), **Restringir temas** (responde só sobre a sua empresa, evitando divagar em outros assuntos), **Dividir mensagens longas** (quebra respostas grandes em várias mensagens curtas, como uma pessoa digitando de verdade), **Delay de resposta** (tempo de espera antes de responder, para parecer mais natural) e a **voz para respostas em áudio** no WhatsApp.',
  },
  {
    step: 10,
    title: 'Foto/logo do Agente',
    content: 'Na tela de Perfil do agente, clique no círculo do avatar (onde aparece a inicial do nome) para subir uma foto ou logo. Essa imagem aparece na lista de agentes, no dashboard e identifica visualmente o agente no painel.',
  },
  {
    step: 11,
    title: 'Configurar Google Calendar',
    content: 'Vá em **Configurações → Integrações** e clique em **Conectar** no Google Calendar. Autorize o acesso e o agente poderá consultar sua disponibilidade real e criar agendamentos automaticamente durante as conversas, sem marcar em cima de outro compromisso.',
  },
  {
    step: 12,
    title: 'Testar o Agente',
    content: 'Na tela do agente, clique no ícone de teste (tubo de ensaio) para abrir o chat de teste. Digite mensagens como se fosse um cliente e veja como o agente responde — inclusive usando as tools e intenções configuradas — antes de colocar ele pra atender de verdade.',
  },
  {
    step: 13,
    title: 'Gerenciar Contatos e Leads',
    content: 'Em **Contatos** você encontra todos que já conversaram. Em **Comercial** (via Dashboard) gerencie seu funil de vendas com leads organizados por etapa do pipeline — inclusive os leads que o agente capturou automaticamente com a tool Criar Lead.',
  },
  {
    step: 14,
    title: 'Monitorar pelo Chat',
    content: 'Em **Chat** você vê todas as conversas em tempo real. Pode responder manualmente, ativar o modo **Human Only** para atender um cliente pessoalmente sem o agente interferir, ou transferir de volta para o agente.',
  },
  {
    step: 15,
    title: 'Configurar Plano e Créditos',
    content: 'Em **Configurações → Planos e Pagamento** escolha seu plano. Cada mensagem processada pelo agente consome créditos (o custo varia conforme o modelo de IA escolhido — veja no card do agente). Você pode comprar créditos avulsos a qualquer momento.',
  },
  {
    step: 16,
    title: 'Adicionar Equipe',
    content: 'Em **Equipe** convide colaboradores pelo e-mail. Defina o papel: Admin (acesso total) ou Agente (só atendimento). Eles recebem o convite por e-mail.',
  },
]

export const FAQ = [
  { q: 'Como criar um agente?', step: 1 },
  { q: 'Como conectar o WhatsApp?', step: 2 },
  { q: 'Como vincular agente ao canal?', step: 3 },
  { q: 'O que configuro no Perfil do agente?', step: 4 },
  { q: 'Como treinar meu agente?', step: 5 },
  { q: 'O que são Intenções?', step: 6 },
  { q: 'Como criar fluxos automáticos?', step: 7 },
  { q: 'O que são IA Tools?', step: 8 },
  { q: 'Como colocar foto no agente?', step: 10 },
  { q: 'Como conectar Google Calendar?', step: 11 },
  { q: 'Como testar o agente?', step: 12 },
  { q: 'Como gerenciar leads?', step: 13 },
  { q: 'Como adicionar equipe?', step: 16 },
  { q: 'Como funciona os créditos?', step: 15 },
]

export function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

interface TutorialContextValue {
  openTutorial: (stepIndex?: number) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error('useTutorial deve ser usado dentro de TutorialProvider')
  return ctx
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)

  const openTutorial = (stepIndex = 0) => {
    setTutorialStep(stepIndex)
    setShowTutorial(true)
  }

  return (
    <TutorialContext.Provider value={{ openTutorial }}>
      {children}

      {showTutorial && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img src="/mascote.png" alt="" className="w-10 h-10 rounded-full object-cover object-top border-2 border-white/30" />
                  <div>
                    <div className="font-bold">Tutorial SyncroFlow</div>
                    <div className="text-xs text-white/70">Passo {tutorialStep + 1} de {TUTORIAL_STEPS.length}</div>
                  </div>
                </div>
                <button onClick={() => setShowTutorial(false)} className="p-1.5 hover:bg-white/20 rounded-full">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-white transition-all"
                  style={{ width: `${((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-6 max-h-[50vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1565C0] to-[#2E7D32] flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {TUTORIAL_STEPS[tutorialStep].step}
                </div>
                <h2 className="text-lg font-bold text-gray-900">{TUTORIAL_STEPS[tutorialStep].title}</h2>
              </div>
              <p
                className="text-gray-600 leading-relaxed text-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(TUTORIAL_STEPS[tutorialStep].content) }}
              />
            </div>

            <div className="flex items-center justify-between p-5 border-t border-gray-100">
              <button
                onClick={() => setTutorialStep(s => Math.max(0, s - 1))}
                disabled={tutorialStep === 0}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
              >
                ← Anterior
              </button>

              <div className="flex gap-1 flex-wrap justify-center max-w-[160px]">
                {TUTORIAL_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTutorialStep(i)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      i === tutorialStep ? 'bg-[#1565C0] w-4' : 'bg-gray-200 hover:bg-gray-300'
                    )}
                  />
                ))}
              </div>

              {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                <button
                  onClick={() => setTutorialStep(s => s + 1)}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
                >
                  Próximo →
                </button>
              ) : (
                <button
                  onClick={() => setShowTutorial(false)}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #2E7D32, #1565C0)' }}
                >
                  Concluir ✓
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </TutorialContext.Provider>
  )
}
