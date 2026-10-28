import { CheckCircle2, Eye, FilePlus2, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback'
import { PageHeader, ProjectPicker } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { downloadExisting, downloadReport, readStatuses, type DownloadStatus } from '@/features/reports/download'
import { ReportPreview } from '@/features/reports/ReportPreview'
import { useAsync } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { formatDate, formatMoney } from '@/lib/utils'
import type { Report } from '@/types'

export default function Reports() {
  const toast = useToast()
  const reports = useAsync(() => api.reports(), [])
  const projects = useAsync(() => api.projects(), [])
  const [pid, setPid] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<Report | null>(null)
  const [preview, setPreview] = useState<Report | null>(null)
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>(readStatuses)
  const refreshStatuses = () => setStatuses(readStatuses())
  const pidResolved = pid ?? projects.data?.[0]?.id
  const nameOf = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? 'Deleted project'

  return (
    <>
      <PageHeader title="Reports" description="Generate a PDF from the current saved project data, or re-download earlier reports." />
      <Card className="mb-6">
        <CardHeader title="Generate a report" description="Includes project details, rooms, quantities, prices, costs, recommendations, assumptions and the engineering disclaimer." />
        <CardBody>
          {projects.loading ? <Spinner className="py-2" /> : !projects.data?.length ? (
            <EmptyState title="No projects" description="Create a project first." action={<Link to="/projects/new"><Button variant="accent">Create project</Button></Link>} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <ProjectPicker projects={projects.data} value={pidResolved} onChange={setPid} />
              <Button variant="accent" loading={busy} onClick={async () => {
                if (!pidResolved) return
                setBusy(true)
                try {
                  const { downloaded } = await downloadReport(pidResolved)
                  if (downloaded) toast.success('Report generated and downloaded.')
                  else toast.error('The report was generated but failed to download. Open Preview to try again.')
                  refreshStatuses(); await reports.reload()
                } catch (e) { toast.error(e instanceof Error ? e.message : 'Report generation failed') } finally { setBusy(false) }
              }}><FilePlus2 className="h-4 w-4" /> Generate & download PDF</Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Report history" />
        {reports.loading && <Spinner />}
        {reports.error && <CardBody><ErrorState message={reports.error} onRetry={reports.reload} /></CardBody>}
        {reports.data && (reports.data.length === 0 ? <CardBody><EmptyState title="No reports yet" description="Generated reports appear here." /></CardBody> : (
          <Table>
            <THead><TR><TH>File</TH><TH>Project</TH><TH className="text-right">Material cost</TH><TH>Generated</TH><TH>Size</TH><TH /></TR></THead>
            <TBody>{reports.data.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.file_name}</TD><TD>{nameOf(r.project_id)}</TD><TD className="text-right tabular-nums">{formatMoney(r.total_cost, r.currency)}</TD>
                <TD>{formatDate(r.created_at)}</TD><TD>{(r.size_bytes / 1024).toFixed(0)} KB</TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="inline-flex items-center gap-3">
                    <DownloadNote status={statuses[r.id]} />
                    <Button size="sm" variant="outline" onClick={() => setPreview(r)}><Eye className="h-4 w-4" /> Preview</Button>
                  </span>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${r.file_name}`} onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </TD>
              </TR>))}
            </TBody>
          </Table>
        ))}
      </Card>
      <ReportPreview report={preview} onClose={() => setPreview(null)} onDownload={async (r) => {
        const ok = await downloadExisting(r.id, r.file_name)
        refreshStatuses()
        if (ok) toast.success('Report downloaded.')
        else toast.error('Failed to download the report.')
      }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete report?" message={`“${del?.file_name}” will be permanently deleted.`}
        onConfirm={async () => { try { await api.deleteReport(del!.id); toast.success('Report deleted.'); await reports.reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed') } setDel(null) }} />
    </>
  )
}

/** "Successfully downloaded" / "Failed to download", for reports downloaded in this browser. */
function DownloadNote({ status }: { status?: DownloadStatus }) {
  if (status === 'ok') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Successfully downloaded</span>
  if (status === 'failed') return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><XCircle className="h-4 w-4" aria-hidden="true" />Failed to download</span>
  return null
}
