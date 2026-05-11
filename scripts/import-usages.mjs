#!/usr/bin/env node
/**
 * Import usages e-phy → Supabase (table usages_phyto)
 *
 * Source : produits_usages_utf8.csv (~80 000 lignes, tous statuts)
 * Usage  : node scripts/import-usages.mjs <chemin/vers/produits_usages_utf8.csv>
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
  console.error('Usage : node scripts/import-usages.mjs <chemin/vers/produits_usages_utf8.csv>')
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

// Colonnes (0-indexé) — produits_usages_utf8.csv, séparateur ;
// 0:numero AMM  1:nom produit  2:identifiant usage  3:date decision
// 4:stade bbch min  5:stade bbch max  6:etat usage  7:dose retenue
// 8:dose unite  9:dar jours  10:dar bbch  11:nb max appli
// 12:date fin distrib  13:date fin utilisation  14:condition emploi
// 15:ZNT aquatique  16:ZNT arthropodes  17:ZNT plantes
// 18:mentions autorisees  19:intervalle min appli (jours)

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

function toDate(raw) {
  if (!raw) return null
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function toInt(raw) {
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

function str(raw) {
  return raw || null
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
    const amm = f[0]
    const usage = f[2]
    const etat = f[6]

    if (!amm || !usage || !etat) { skipped++; continue }

    // identifiant usage = "Culture*TypeTraitement*Nuisible"
    const parts = usage.split('*')
    const culture_ephy     = parts[0]?.trim() || null
    const type_traitement  = parts[1]?.trim() || null
    const nuisible         = parts[2]?.trim() || null

    if (!culture_ephy) { skipped++; continue }

    batch.push({
      amm,
      nom_produit:          str(f[1]),
      culture_ephy,
      type_traitement,
      nuisible,
      date_decision:        toDate(f[3]),
      stade_bbch_min:       str(f[4]),
      stade_bbch_max:       str(f[5]),
      etat_usage:           etat,
      dose_retenue:         str(f[7]),
      dose_unite:           str(f[8]),
      dar_jours:            toInt(f[9]),
      dar_bbch:             str(f[10]),
      nb_max_applications:  toInt(f[11]),
      date_fin_distribution: toDate(f[12]),
      date_fin_utilisation:  toDate(f[13]),
      condition_emploi:     str(f[14]),
      znt_aquatique_m:      toInt(f[15]),
      znt_arthropodes_m:    toInt(f[16]),
      znt_plantes_m:        toInt(f[17]),
      mentions:             str(f[18]),
      intervalle_min_jours: toInt(f[19]),
    })

    if (batch.length >= 500) {
      const { error } = await supabase.from('usages_phyto').insert(batch)
      if (error) { console.error('\nErreur :', error.message); process.exit(1) }
      total += batch.length
      process.stdout.write(`\rImporté : ${total} lignes…`)
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('usages_phyto').insert(batch)
    if (error) { console.error('\nErreur :', error.message); process.exit(1) }
    total += batch.length
  }

  console.log(`\n✓ ${total} lignes importées (${skipped} ignorées)`)
}

main().catch(err => { console.error(err); process.exit(1) })
