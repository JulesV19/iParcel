#!/usr/bin/env node
/**
 * Import usages MFSC → Supabase (table usages_mfsc)
 *
 * Source : mfsc_et_mixte_usage_utf8.csv
 * Usage  : node scripts/import-usages-mfsc.mjs <chemin/vers/mfsc_et_mixte_usage_utf8.csv>
 *
 * Prérequis dans .env.local :
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import fs from 'fs'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

const envFile = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const [,, csvPath] = process.argv
if (!csvPath) {
  console.error('Usage : node scripts/import-usages-mfsc.mjs <chemin/vers/mfsc_et_mixte_usage_utf8.csv>')
  process.exit(1)
}
if (!fs.existsSync(csvPath)) {
  console.error(`Fichier introuvable : ${csvPath}`)
  process.exit(1)
}

const { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = process.env
if (!supabaseUrl || !serviceKey) {
  console.error('Variables manquantes dans .env.local :\n  NEXT_PUBLIC_SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

// Colonnes (0-indexé) — mfsc_et_mixte_usage_utf8.csv, séparateur ;
// 0: type produit  1: numero AMM  2: nom produit  3: type culture libelle
// 4: dose min par apport  5: dose min par apport unite
// 6: dose max par apport  7: dose max par apport unite
// 8: stade cultural min (BBCH)  9: stade cultural max (BBCH)
// 10: etat usage  11: saison application min  12: saison application max
// 13: saison application min commentaire  14: saison application max commentaire
// 15: date decision  16: culture commentaire

function parseLine(line) {
  const fields = []
  let cur = '', inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if (ch === ';' && !inQuote) { fields.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  fields.push(cur.trim())
  return fields
}

function toFloat(raw) {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? null : n
}

async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }) })
  let firstLine = true
  const batch = []
  let total = 0, skipped = 0

  for await (const line of rl) {
    if (firstLine) { firstLine = false; continue }
    if (!line.trim()) continue

    const f = parseLine(line)
    const amm = f[1]
    const type_culture = f[3]
    const etat_usage = f[10]

    if (!amm || !type_culture || !etat_usage) { skipped++; continue }

    batch.push({
      amm,
      nom_produit:          f[2] || null,
      type_culture,
      dose_min:             toFloat(f[4]),
      dose_min_unite:       f[5] || null,
      dose_max:             toFloat(f[6]),
      dose_max_unite:       f[7] || null,
      etat_usage,
      culture_commentaire:  f[16] || null,
    })

    if (batch.length >= 500) {
      const { error } = await supabase.from('usages_mfsc').insert(batch)
      if (error) { console.error('\nErreur :', error.message); process.exit(1) }
      total += batch.length
      process.stdout.write(`\rImporté : ${total} lignes…`)
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('usages_mfsc').insert(batch)
    if (error) { console.error('\nErreur :', error.message); process.exit(1) }
    total += batch.length
  }

  console.log(`\n✓ ${total} usages MFSC importés (${skipped} ignorés)`)
}

main().catch(err => { console.error(err); process.exit(1) })
