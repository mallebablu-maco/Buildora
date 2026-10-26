import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="bg-grid flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-sm text-slate-500">404</p>
      <h1 className="text-2xl font-bold text-navy-900">That page does not exist</h1>
      <Link to="/"><Button variant="accent">Back to home</Button></Link>
    </main>
  )
}
