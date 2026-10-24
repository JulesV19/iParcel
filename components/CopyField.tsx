'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export default function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Presse-papiers refusé par le navigateur : le texte reste sélectionnable
    }
  }

  return (
    <div className="mt-2">
      <p className="text-xs text-ink-3">{label}</p>
      <div className="mt-1 flex items-start gap-2 rounded-xl bg-paper-2 py-1.5 pl-3 pr-1.5">
        <code className={`min-w-0 flex-1 py-1 font-mono text-[12px] text-ink break-all ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</code>
        <button type="button" onClick={copy} aria-label={`Copier : ${label}`} className="icon-btn h-7 w-7 shrink-0">
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      </div>
    </div>
  )
}
