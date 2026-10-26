import { Alert } from '@/components/ui/feedback'

/** Shown instead of the app when the build-time configuration is missing or wrong, so the failure is explained, not a blank page. */
export default function ConfigError({ problems }: { problems: string[] }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold text-navy-900">Buildora is not configured</h1>
      <Alert tone="error" title="Fix these settings and rebuild">
        <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      </Alert>
      <p className="text-sm text-slate-600">
        Copy <code>frontend/.env.example</code> to <code>frontend/.env.local</code> and fill in the public Supabase values. On Render, set them as environment variables on the static site and redeploy.
      </p>
    </main>
  )
}
