/** Build-time configuration. Only PUBLIC values live here (they are part of the browser bundle). */

const trimUrl = (v: string | undefined) =>
  (v ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '')

export const env = {
  supabaseUrl: trimUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim(),
  /** Empty in development (Vite proxies /api); the API service URL on Render. */
  apiBase: (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
}

export function configProblems(values: Pick<typeof env, 'supabaseUrl' | 'supabaseKey'> = env): string[] {
  const problems: string[] = []
  if (!values.supabaseUrl) problems.push('VITE_SUPABASE_URL is not set.')
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(values.supabaseUrl)) problems.push('VITE_SUPABASE_URL should look like https://<project-ref>.supabase.co')
  if (!values.supabaseKey) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY is not set.')
  else if (values.supabaseKey.startsWith('sb_secret_')) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY contains a SECRET key. Use the publishable key and rotate the secret one.')
  return problems
}
