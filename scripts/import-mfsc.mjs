#!/usr/bin/env node
/**
 * Import MFSC → Supabase (table produits_mfsc)
 *
 * Source : mfsc_et_mixte_composition_utf8.csv
 * Usage  : node scripts/import-mfsc.mjs <chemin/vers/mfsc_et_mixte_composition_utf8.csv>
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
  console.error('Usage : node scripts/import-mfsc.mjs <chemin/vers/mfsc_et_mixte_composition_utf8.csv>')
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

// Colonnes (0-indexé) — mfsc_et_mixte_composition_utf8.csv, séparateur ;
// 0: type produit  1: numero AMM  2: nom produit  3: Composition  4: Revendication  5: Dénomination de classe

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

async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }) })
  let firstLine = true
  const batch = []
  let total = 0, skipped = 0

  for await (const line of rl) {
    if (firstLine) { firstLine = false; continue }
    if (!line.trim()) continue

    const f = parseLine(line)
    const type_produit = f[0]
    const amm = f[1]
    const nom_produit = f[2]

    const composition = f[3] || null

    if (!amm || !nom_produit) { skipped++; continue }

    batch.push({ amm, nom_produit, type_produit: type_produit || null, composition })

    if (batch.length >= 500) {
      const { error } = await supabase
        .from('produits_mfsc')
        .upsert(batch, { onConflict: 'amm' })
      if (error) { console.error('\nErreur :', error.message); process.exit(1) }
      total += batch.length
      process.stdout.write(`\rImporté : ${total} produits…`)
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase
      .from('produits_mfsc')
      .upsert(batch, { onConflict: 'amm' })
    if (error) { console.error('\nErreur :', error.message); process.exit(1) }
    total += batch.length
  }

  console.log(`\n✓ ${total} produits MFSC importés (${skipped} lignes ignorées)`)
}

main().catch(err => { console.error(err); process.exit(1) })
