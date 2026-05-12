'use client'

import type { SearchResultItem } from '@/lib/types'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  results: SearchResultItem[]
  loading: boolean
  selectedProduct: SearchResultItem | null
  onSelectProduct: (p: SearchResultItem) => void
}

export default function SearchSidebar({
  query,
  onQueryChange,
  results,
  loading,
  selectedProduct,
  onSelectProduct,
}: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <input
          type="text"
          placeholder="Nom commercial…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="input-glass w-full rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        )}
        {!loading && query.length < 2 && (
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-faint)' }}>Saisissez au moins 2 caractères</p>
        )}
        {!loading && query.length >= 2 && results.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>Aucun résultat</p>
        )}
        {results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map(r => {
              const isActive = selectedProduct?.amm === r.amm && selectedProduct?.kind === r.kind
              return (
                <li
                  key={`${r.kind}-${r.amm}`}
                  onClick={() => onSelectProduct(r)}
                  className="rounded-xl p-3 cursor-pointer transition-all duration-200"
                  style={isActive ? {
                    background: 'var(--accent-bg)',
                    border: '1px solid var(--accent-border)',
                    boxShadow: 'var(--accent-glow)',
                  } : {
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--glass-bg-hover)'; e.currentTarget.style.borderColor = 'var(--glass-border-hover)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--glass-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' } }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{r.nom}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${r.kind === 'phyto' ? 'text-red-400 bg-red-400/10' : 'text-blue-400 bg-blue-400/10'}`}>
                      {r.kind === 'phyto' ? 'Phyto' : 'MFSC'}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>AMM {r.amm}</p>
                  {r.kind === 'phyto' && r.statut && (
                    <p className="text-[10px] mt-0.5" style={{ color: r.statut.toLowerCase().includes('autoris') ? 'var(--accent)' : 'var(--text-faint)' }}>
                      {r.statut}
                    </p>
                  )}
                  {r.type_produit && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{r.type_produit}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
