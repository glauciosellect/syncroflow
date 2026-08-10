'use client'
import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TUTORIAL_STEPS, FAQ, renderMarkdown, useTutorial } from './tutorial-context'

const POSITION_STORAGE_KEY = 'syncroflow:mascote-position'
const BUTTON_SIZE = 64
const DRAG_THRESHOLD = 6

function getDefaultPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  return { x: window.innerWidth - BUTTON_SIZE - 24, y: window.innerHeight - BUTTON_SIZE - 24 }
}

function clampPosition(pos: { x: number; y: number }) {
  if (typeof window === 'undefined') return pos
  const maxX = window.innerWidth - BUTTON_SIZE
  const maxY = window.innerHeight - BUTTON_SIZE
  return { x: Math.min(Math.max(pos.x, 0), Math.max(maxX, 0)), y: Math.min(Math.max(pos.y, 0), Math.max(maxY, 0)) }
}

export function MascoteHelper() {
  const { openTutorial } = useTutorial()
  const [open, setOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const draggedRef = useRef(false)
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, originX: 0, originY: 0 })

  useEffect(() => {
    let initial: { x: number; y: number } | null = null
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY)
      if (saved) initial = JSON.parse(saved)
    } catch {
      initial = null
    }
    setPosition(clampPosition(initial ?? getDefaultPosition()))

    const handleResize = () => setPosition(prev => (prev ? clampPosition(prev) : prev))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const handleMove = (clientX: number, clientY: number) => {
      const { pointerX, pointerY, originX, originY } = dragStartRef.current
      const dx = clientX - pointerX
      const dy = clientY - pointerY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) draggedRef.current = true
      setPosition(clampPosition({ x: originX + dx, y: originY + dy }))
    }

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) handleMove(touch.clientX, touch.clientY)
    }
    const onEnd = () => {
      setDragging(false)
      setPosition(prev => {
        if (prev) {
          try {
            localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(prev))
          } catch {
            // ignore storage errors
          }
        }
        return prev
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging])

  const startDrag = (clientX: number, clientY: number) => {
    if (!position) return
    draggedRef.current = false
    dragStartRef.current = { pointerX: clientX, pointerY: clientY, originX: position.x, originY: position.y }
    setDragging(true)
  }

  const handleButtonClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (expandedFaq !== null) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedFaq])

  const toggleFaq = (index: number) => {
    setExpandedFaq(prev => prev === index ? null : index)
  }

  const handleFaqStep = (faq: typeof FAQ[0]) => {
    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.step === faq.step)
    if (stepIndex >= 0) openTutorial(stepIndex)
  }

  if (!position) return null

  const openUpward = position.y > (typeof window !== 'undefined' ? window.innerHeight : 0) / 2
  const openLeftward = position.x > (typeof window !== 'undefined' ? window.innerWidth : 0) / 2 - 160

  return (
    <>
      {/* Botão flutuante e arrastável */}
      <button
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          const touch = e.touches[0]
          if (touch) startDrag(touch.clientX, touch.clientY)
        }}
        onClick={handleButtonClick}
        className={cn(
          'fixed z-50 w-16 h-16 rounded-full shadow-2xl overflow-hidden border-2 border-white hover:scale-110 transition-transform touch-none select-none',
          dragging ? 'cursor-grabbing scale-110' : 'cursor-grab'
        )}
        style={{ left: position.x, top: position.y }}
        title="Ajuda — SyncroFlow (arraste para mover)"
      >
        <img src="/mascote.png" alt="Mascote SyncroFlow" className="w-full h-full object-cover object-top" draggable={false} />
      </button>

      {/* Janela do assistente */}
      {open && (
        <div
          className="fixed z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{
            maxHeight: '560px',
            [openLeftward ? 'right' : 'left']: openLeftward
              ? Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 0) - position.x - BUTTON_SIZE)
              : position.x,
            [openUpward ? 'bottom' : 'top']: openUpward
              ? Math.max(16, (typeof window !== 'undefined' ? window.innerHeight : 0) - position.y + 12)
              : position.y + BUTTON_SIZE + 12,
          }}
        >
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

    </>
  )
}
