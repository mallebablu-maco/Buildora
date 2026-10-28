import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, Spinner } from '@/components/ui/feedback'
import { api } from '@/lib/api'
import type { Report } from '@/types'

/** Shows a saved PDF report inside the page, with a Download button. */
export function ReportPreview({ report, onClose, onDownload }: { report: Report | null; onClose: () => void; onDownload: (r: Report) => Promise<void> }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!report) return
    let live = true
    let made: string | null = null
    setUrl(null); setError(null)
    api.reportBlob(report.id)
      .then((blob) => { if (!live) return; made = URL.createObjectURL(blob); setUrl(made) })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the report.') })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [report, attempt])

  return (
    <Dialog open={!!report} onClose={onClose} title={report?.file_name ?? 'Report'} description="Preview of the saved PDF." className="w-[min(64rem,calc(100vw-2rem))]">
      <div className="space-y-3">
        {error ? <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          : !url ? <Spinner label="Loading the PDF…" />
          : <iframe title={`Preview of ${report?.file_name}`} src={url} className="h-[65vh] w-full rounded-md border border-slate-200" />}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="accent" loading={busy} disabled={!report} onClick={async () => { if (!report) return; setBusy(true); try { await onDownload(report) } finally { setBusy(false) } }}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
