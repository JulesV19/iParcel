import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Wordmark } from '@/components/Brand'

export default function LegalPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-ground px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] md:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Wordmark />
          <Link href="/" className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-2 hover:bg-paper hover:text-ink">
            <ArrowLeft size={16} aria-hidden />
            Retour
          </Link>
        </div>
        <article className="rounded-[24px] border border-line bg-paper p-6 shadow-[var(--shadow-float)] md:p-10 [&_a]:underline [&_a]:decoration-line [&_a]:underline-offset-2 [&_a:hover]:decoration-ink-2 [&_h2]:text-[15px] [&_li]:leading-relaxed [&_p]:leading-relaxed [&_section]:max-w-[65ch]">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
          {updated && <p className="mt-1 mb-8 text-xs text-ink-3">Dernière mise à jour : {updated}</p>}
          {!updated && <div className="mb-8" />}
          {children}
        </article>
      </div>
    </div>
  )
}
