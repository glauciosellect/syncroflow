'use client'
import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Criar seu Agente de IA',
    content: 'Vá em **Agentes** no menu lateral e clique em **Novo Agente**. Escolha um nome, a função (ex: Atendimento ao Cliente) e o objetivo. Depois configure a empresa e as preferências iniciais.',
  },
  {
    step: 2,
    title: 'Conectar seu WhatsApp',
    content: 'Vá em **Configurações → Canais** e clique em **WhatsApp**. Dê um nome à conexão, clique em Conectar e escaneie o QR Code com o WhatsApp Business do seu celular.',
  },
  {
    step: 3,
    title: 'Vincular Agente ao Canal',
    content: 'Ainda em **Canais**, após conectar o WhatsApp, use o seletor de **Agente vinculado** para escolher qual agente vai atender aquele número. Clique no ícone de salvar.',
  },
  {
    step: 4,
    title: 'Treinar o Agente',
    content: 'Acesse o agente em **Agentes**, clique em **Editar** e vá na aba **Treinamentos**. Adicione textos sobre sua empresa, produtos e serviços. Quanto mais informação, melhor o atendimento.',
  },
  {
    step: 5,
    title: 'Configurar Intenções',
    content: 'Na aba **Intenções**, crie gatilhos para ações especiais: transferir para humano, agendar no Google Calendar, enviar mensagem fixa ou acionar um webhook externo.',
  },
  {
    step: 6,
    title: 'Testar o Agente',
    content: 'Na tela do agente, clique no ícone de teste (tubo de ensaio) para abrir o chat de teste. Digite mensagens como se fosse um cliente e veja como o agente responde.',
  },
  {
    step: 7,
    title: 'Criar Fluxos de Atendimento',
    content: 'Na aba **Fluxos**, crie scripts automáticos com gatilhos. Ex: quando o cliente digitar "preço", o agente responde com tabela de valores automaticamente.',
  },
  {
    step: 8,
    title: 'Ativar IA Tools (Ferramentas)',
    content: 'Na aba **IA Tools**, ative as ferramentas que o agente pode usar: **Consultar Pedido** (Nuvemshop), **Gerar Link de Pagamento** (Asaas), **Agendar Horário** (Google Calendar), **Criar Lead no CRM**, **Consultar Clima** e outras. Cada tool expande o que o agente consegue fazer automaticamente durante a conversa. Para ativar, basta ligar o toggle da tool desejada — algumas requerem uma integração conectada.',
  },
  {
    step: 9,
    title: 'Configurar Google Calendar',
    content: 'Vá em **Configurações → Integrações** e clique em **Conectar** no Google Calendar. Autorize o acesso e o agente poderá criar agendamentos automaticamente durante conversas.',
  },
  {
    step: 10,
    title: 'Gerenciar Contatos e Leads',
    content: 'Em **Contatos** você encontra todos que já conversaram. Em **Comercial** (via Dashboard) gerencie seu funil de vendas com leads organizados por etapa do pipeline.',
  },
  {
    step: 11,
    title: 'Monitorar pelo Chat',
    content: 'Em **Chat** você vê todas as conversas em tempo real. Pode responder manualmente, ativar o modo **Human Only** para atender um cliente pessoalmente, ou transferir de volta para o agente.',
  },
  {
    step: 12,
    title: 'Configurar Plano e Créditos',
    content: 'Em **Configurações → Planos e Pagamento** escolha seu plano. Cada mensagem processada pelo agente consome créditos. Você pode comprar créditos avulsos a qualquer momento.',
  },
  {
    step: 13,
    title: 'Adicionar Equipe',
    content: 'Em **Equipe** convide colaboradores pelo e-mail. Defina o papel: Admin (acesso total) ou Agente (só atendimento). Eles recebem o convite por e-mail.',
  },
]

const FAQ = [
  { q: 'Como criar um agente?', step: 1 },
  { q: 'Como conectar o WhatsApp?', step: 2 },
  { q: 'Como treinar meu agente?', step: 4 },
  { q: 'Como testar o agente?', step: 6 },
  { q: 'Como vincular agente ao canal?', step: 3 },
  { q: 'O que são IA Tools?', step: 8 },
  { q: 'Como criar fluxos automáticos?', step: 7 },
  { q: 'Como conectar Google Calendar?', step: 9 },
  { q: 'Como gerenciar leads?', step: 10 },
  { q: 'Como adicionar equipe?', step: 13 },
  { q: 'Como funciona os créditos?', step: 12 },
]

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export function MascoteHelper() {
  const [open, setOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expandedFaq !== null) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedFaq])

  const toggleFaq = (index: number) => {
    setExpandedFaq(prev => prev === index ? null : index)
  }

  const openTutorial = (stepIndex: number) => {
    setTutorialStep(stepIndex)
    setShowTutorial(true)
  }

  const handleFaqStep = (faq: typeof FAQ[0]) => {
    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.step === faq.step)
    if (stepIndex >= 0) openTutorial(stepIndex)
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl overflow-hidden border-2 border-white hover:scale-110 transition-transform"
        title="Ajuda — SyncroFlow"
      >
        <img src="/mascote.png" alt="Mascote SyncroFlow" className="w-full h-full object-cover object-top" />
      </button>

      {/* Janela do assistente */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" style={{ maxHeight: '560px' }}>
          {/* Header */}
          <div className="flex items-center gap-3 p-4 text-white shrink-0" style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}>
            <img src="/mascote.png" alt="" className="w-9 h-9 rounded-full object-cover object-top border-2 border-white/30" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Assistente SyncroFlow</div>
              <div className="text-xs text-white/70">Tira-dúvidas · Tutorial</div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Perguntas frequentes em accordion */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 pb-0">
              <p className="text-xs text-gray-400 font-medium mb-2">Perguntas frequentes — clique para ver a resposta:</p>
            </div>
            <div className="px-3 space-y-1.5 pb-3">
              {FAQ.map((faq, i) => {
                const step = TUTORIAL_STEPS.find(s => s.step === faq.step)
                const isOpen = expandedFaq === i
                return (
                  <div key={i} className={cn('rounded-xl border transition-all overflow-hidden', isOpen ? 'border-[#1565C0] bg-blue-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200')}>
                    <button
                      onClick={() => toggleFaq(i)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                    >
                      <span className={cn('text-xs font-medium leading-snug', isOpen ? 'text-[#1565C0]' : 'text-gray-700')}>{faq.q}</span>
                      <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 ml-2 transition-transform', isOpen ? 'rotate-180 text-[#1565C0]' : 'text-gray-400')} />
                    </button>
                    {isOpen && step && (
                      <div className="px-3 pb-3">
                        <p
                          className="text-xs text-gray-600 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(step.content) }}
                        />
                        <button
                          onClick={() => handleFaqStep(faq)}
                          className="mt-2.5 text-xs font-semibold text-[#1565C0] hover:underline flex items-center gap-1"
                        >
                          Ver no tutorial completo →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Botão tutorial */}
          <div className="p-3 border-t border-gray-100 shrink-0">
            <button
              onClick={() => openTutorial(0)}
              className="w-full py-2.5 text-xs font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #1565C0, #2E7D32)' }}
            >
              📖 Ver tutorial completo ({TUTORIAL_STEPS.length} passos)
            </button>
          </div>
        </div>
      )}

      {/* Modal Tutorial Completo */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Header tutorial */}
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
              {/* Barra de progresso */}
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-white transition-all"
                  style={{ width: `${((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Conteúdo */}
            <div className="p-6">
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

            {/* Navegação */}
            <div className="flex items-center justify-between p-5 border-t border-gray-100">
              <button
                onClick={() => setTutorialStep(s => Math.max(0, s - 1))}
                disabled={tutorialStep === 0}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors"
              >
                ← Anterior
              </button>

              {/* Índice rápido */}
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
    </>
  )
}
