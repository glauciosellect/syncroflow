export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 to-indigo-700 items-center justify-center p-12">
        <div className="text-white max-w-md">
          <div className="text-4xl font-bold mb-4">SyncroFlow</div>
          <p className="text-lg text-violet-100 mb-8">
            Plataforma de atendimento omnichannel com IA. Crie agentes inteligentes para WhatsApp, Instagram, Telegram e mais.
          </p>
          <div className="space-y-4">
            {['Multi-modelo: Claude, GPT-4, Gemini', 'WhatsApp, Instagram, Facebook, Telegram', 'RAG inteligente com base de conhecimento', 'Analytics avançado por atendimento'].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="w-2 h-2 bg-violet-300 rounded-full" />
                <span className="text-violet-100">{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        {children}
      </div>
    </div>
  )
}
