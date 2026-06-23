export function ChannelIcon({ type, className = 'w-9 h-9' }: { type: string; className?: string }) {
  if (type === 'WHATSAPP') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#25D366"/>
      <path d="M16 6C10.477 6 6 10.477 6 16c0 1.89.52 3.66 1.43 5.18L6 26l4.95-1.41A9.94 9.94 0 0016 26c5.523 0 10-4.477 10-10S21.523 6 16 6zm0 18a7.94 7.94 0 01-4.07-1.12l-.29-.17-3.02.86.85-3.01-.19-.3A7.96 7.96 0 018 16c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8zm4.39-5.85c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.57.18 1.09.15 1.5.09.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" fill="white"/>
    </svg>
  )
  if (type === 'INSTAGRAM') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="url(#ig-grad)"/>
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="130%">
          <stop offset="0%" stopColor="#ffd879"/>
          <stop offset="25%" stopColor="#f7972a"/>
          <stop offset="50%" stopColor="#ee2a7b"/>
          <stop offset="75%" stopColor="#8228d0"/>
          <stop offset="100%" stopColor="#4f5bd5"/>
        </radialGradient>
      </defs>
      <rect x="8" y="8" width="16" height="16" rx="5" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="16" cy="16" r="4" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="21.5" cy="10.5" r="1" fill="white"/>
    </svg>
  )
  if (type === 'FACEBOOK') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#1877F2"/>
      <path d="M21 12h-3v-2c0-.55.45-1 1-1h2V6h-2c-2.76 0-5 2.24-5 5v1h-2v4h2v10h4V16h3l1-4z" fill="white"/>
    </svg>
  )
  if (type === 'TELEGRAM') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#29B6F6"/>
      <path d="M7 15.5l15-6.5-3 15-4-5-5 3 1-4.5L18 13l-8.5 5.5L7 15.5z" fill="white"/>
    </svg>
  )
  if (type === 'LINKEDIN') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#0A66C2"/>
      <path d="M10 13h3v10h-3V13zm1.5-4.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM15 13h3v1.4c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.6 2 3.6 4.7V23h-3v-4.8c0-1.1 0-2.6-1.6-2.6-1.6 0-1.9 1.2-1.9 2.5V23h-3V13z" fill="white"/>
    </svg>
  )
  if (type === 'WIDGET') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#6366F1"/>
      <path d="M8 10a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-4l-4 3v-3H10a2 2 0 01-2-2V10z" fill="white"/>
    </svg>
  )
  if (type === 'EMAIL') return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#EA4335"/>
      <path d="M7 10a1 1 0 011-1h16a1 1 0 011 1v12a1 1 0 01-1 1H8a1 1 0 01-1-1V10z" fill="white"/>
      <path d="M7 10.5l9 6.5 9-6.5" stroke="#EA4335" strokeWidth="1.5" fill="none"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect width="32" height="32" rx="8" fill="#94A3B8"/>
      <path d="M16 8a8 8 0 100 16A8 8 0 0016 8zm0 12a4 4 0 110-8 4 4 0 010 8z" fill="white"/>
    </svg>
  )
}
