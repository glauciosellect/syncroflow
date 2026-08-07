import type { Metadata } from 'next'
import { Suspense } from 'react'
import ChatPage from '@/app/(dashboard)/chat/page'
import { InstallChatShortcutDialog } from '@/components/shared/install-chat-shortcut'

export const metadata: Metadata = {
  manifest: '/manifest-chat.json',
}

export default function StandaloneChatPage() {
  return (
    <>
      <Suspense fallback={null}>
        <InstallChatShortcutDialog />
      </Suspense>
      <ChatPage />
    </>
  )
}
