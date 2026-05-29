interface SyncroFlowConfig {
  channelId: string
  apiUrl: string
  color?: string
  position?: 'bottom-right' | 'bottom-left'
  welcomeMessage?: string
  agentName?: string
}

declare global {
  interface Window {
    SyncroFlow: (config: SyncroFlowConfig) => void
  }
}

function createWidget(config: SyncroFlowConfig) {
  const { channelId, apiUrl, color = '#6366f1', position = 'bottom-right', welcomeMessage = 'Olá! Como posso ajudar?', agentName = 'Assistente' } = config

  const styles = `
    #sf-widget-btn {
      position: fixed;
      ${position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
      bottom: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${color};
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #sf-widget-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
    #sf-widget-btn svg { width: 24px; height: 24px; fill: white; }
    #sf-chat-window {
      position: fixed;
      ${position === 'bottom-right' ? 'right: 20px;' : 'left: 20px;'}
      bottom: 90px;
      width: 360px;
      height: 520px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      z-index: 99998;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #sf-chat-window.open { display: flex; }
    #sf-chat-header {
      background: ${color};
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #sf-chat-header-avatar {
      width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center; font-size: 16px;
    }
    #sf-chat-header-name { font-weight: 600; font-size: 15px; }
    #sf-chat-header-status { font-size: 12px; opacity: 0.8; }
    #sf-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      background: #f8f9fa;
    }
    .sf-msg { max-width: 75%; padding: 10px 14px; border-radius: 18px; font-size: 14px; line-height: 1.4; }
    .sf-msg-bot { align-self: flex-start; background: white; color: #1a1a1a; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-bottom-left-radius: 4px; }
    .sf-msg-user { align-self: flex-end; background: ${color}; color: white; border-bottom-right-radius: 4px; }
    .sf-msg-time { font-size: 11px; margin-top: 4px; opacity: 0.5; }
    #sf-input-area { padding: 12px; border-top: 1px solid #f0f0f0; background: white; display: flex; gap: 8px; }
    #sf-input {
      flex: 1; border: 1px solid #e5e7eb; border-radius: 24px; padding: 8px 16px; font-size: 14px;
      outline: none; background: #f9fafb;
    }
    #sf-input:focus { border-color: ${color}; background: white; }
    #sf-send {
      width: 36px; height: 36px; border-radius: 50%; background: ${color}; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #sf-send svg { width: 16px; height: 16px; fill: white; }
    #sf-typing { display: flex; gap: 4px; padding: 10px 14px; background: white; border-radius: 18px; border-bottom-left-radius: 4px; align-self: flex-start; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .sf-dot { width: 6px; height: 6px; border-radius: 50%; background: #999; animation: sf-blink 1.4s infinite; }
    .sf-dot:nth-child(2) { animation-delay: 0.2s; }
    .sf-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes sf-blink { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
  `

  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  document.head.appendChild(styleEl)

  const btn = document.createElement('button')
  btn.id = 'sf-widget-btn'
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`
  document.body.appendChild(btn)

  const window_ = document.createElement('div')
  window_.id = 'sf-chat-window'
  window_.innerHTML = `
    <div id="sf-chat-header">
      <div id="sf-chat-header-avatar">🤖</div>
      <div>
        <div id="sf-chat-header-name">${agentName}</div>
        <div id="sf-chat-header-status">Online agora</div>
      </div>
    </div>
    <div id="sf-messages"></div>
    <div id="sf-input-area">
      <input id="sf-input" type="text" placeholder="Digite sua mensagem..." />
      <button id="sf-send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
  `
  document.body.appendChild(window_)

  let sessionId = localStorage.getItem('sf_session') || crypto.randomUUID()
  localStorage.setItem('sf_session', sessionId)
  let isOpen = false

  function addMessage(content: string, role: 'user' | 'bot') {
    const msgs = document.getElementById('sf-messages')!
    const msg = document.createElement('div')
    msg.className = `sf-msg ${role === 'user' ? 'sf-msg-user' : 'sf-msg-bot'}`
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    msg.innerHTML = `${content}<div class="sf-msg-time">${now}</div>`
    msgs.appendChild(msg)
    msgs.scrollTop = msgs.scrollHeight
  }

  function showTyping() {
    const msgs = document.getElementById('sf-messages')!
    const typing = document.createElement('div')
    typing.id = 'sf-typing'
    typing.innerHTML = '<div class="sf-dot"></div><div class="sf-dot"></div><div class="sf-dot"></div>'
    msgs.appendChild(typing)
    msgs.scrollTop = msgs.scrollHeight
    return typing
  }

  async function sendMessage(text: string) {
    const input = document.getElementById('sf-input') as HTMLInputElement
    input.value = ''
    addMessage(text, 'user')
    const typing = showTyping()

    try {
      const res = await fetch(`${apiUrl}/webhooks/widget/${channelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      })
      const data = await res.json()
      typing.remove()
      if (data.reply) addMessage(data.reply, 'bot')
    } catch {
      typing.remove()
      addMessage('Desculpe, não consegui conectar. Tente novamente.', 'bot')
    }
  }

  btn.addEventListener('click', () => {
    isOpen = !isOpen
    window_.classList.toggle('open', isOpen)
    if (isOpen && document.getElementById('sf-messages')!.children.length === 0) {
      addMessage(welcomeMessage, 'bot')
    }
  })

  document.getElementById('sf-send')!.addEventListener('click', () => {
    const input = document.getElementById('sf-input') as HTMLInputElement
    const text = input.value.trim()
    if (text) sendMessage(text)
  })

  document.getElementById('sf-input')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('sf-input') as HTMLInputElement
      const text = input.value.trim()
      if (text) sendMessage(text)
    }
  })
}

window.SyncroFlow = createWidget
