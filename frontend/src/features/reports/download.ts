import { api, saveBlob } from '@/lib/api'
import type { Report } from '@/types'

export type DownloadStatus = 'ok' | 'failed'
const KEY = 'buildora_report_downloads'

/** Whether each report was downloaded on this device. Remembered in this browser only (a convenience, not project data). */
export function readStatuses(): Record<string, DownloadStatus> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, DownloadStatus> } catch { return {} }
}
export function rememberStatus(id: string, status: DownloadStatus) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readStatuses(), [id]: status })) } catch { /* private window: the message just isn't remembered */ }
}

/**
 * Generates a fresh report from the current saved project data, then downloads the PDF.
 * If generating fails it throws (no report exists). If only the download fails, the report still exists and
 * `downloaded` is false, so the page can say "Failed to download" next to it.
 */
export async function downloadReport(projectId: string): Promise<{ report: Report; downloaded: boolean }> {
  const report = await api.createReport(projectId)
  const downloaded = await downloadExisting(report.id, report.file_name)
  return { report, downloaded }
}

/** Downloads a saved report; records and returns whether it worked. */
export async function downloadExisting(id: string, fileName: string): Promise<boolean> {
  try {
    saveBlob(await api.reportBlob(id), fileName)
    rememberStatus(id, 'ok')
    return true
  } catch {
    rememberStatus(id, 'failed')
    return false
  }
}
