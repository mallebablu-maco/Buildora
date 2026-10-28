import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useToast } from '@/lib/toast'
import { authMessage } from './errors'
import { useAuth } from './useAuth'

/** "Log out?" asked before every log-out, so a stray click does not end the session. */
export function LogoutConfirm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <ConfirmDialog open={open} title="Log out?" message="You will need to log in again to see your projects. Anything you saved stays safe."
      confirmLabel="Log out" busy={busy} onCancel={onClose}
      onConfirm={async () => {
        setBusy(true)
        try { await signOut(); onClose() } catch (e) { toast.error(authMessage(e)) } finally { setBusy(false) }
      }} />
  )
}
