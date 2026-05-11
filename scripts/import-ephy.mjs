#!/usr/bin/env node
/**
 * Import e-phy → Supabase (table produits_phyto)
 *
 * Source : produits_utf8.csv du dossier decisionamm-intrant-format-csv-*
 * Usage  : node scripts/import-ephy.mjs <chemin/vers/produits_utf8.csv>
 *
 * Prérequis dans .env.local :
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import fs from 'fs'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

// Lecture de .env.local sans dépendance externe
const envFile = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const [,, csvPath] = process.argv
if (!csvPath) {
  console.error('Usage : node scripts/import-ephy.mjs <chemin/vers/produits_utf8.csv>')
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

// Colonnes attendues dans produits_utf8.csv (séparateur ;)
// type produit;numero AMM;nom produit;seconds noms commerciaux;titulaire;
// type commercial;gamme usage;mentions autorisees;restrictions usage;
// restrictions usage libelle;Substances actives;fonctions;formulations;
// Etat d'autorisation;Date de retrait du produit;Date de première autorisation;...
const COL = {
  AMM:         1,
  NOM:         2,
  TITULAIRE:   4,
  FONCTIONS:   11,
  STATUT:      13,
  DATE_RETRAIT: 14,
  DATE_AMM:    15,
}

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

// DD/MM/YYYY → YYYY-MM-DD, retourne null si vide ou invalide
function toIso(raw) {
  if (!raw) return null
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }) })
  let firstLine = true
  const batch = []
  let total = 0, skipped = 0

  for await (const line of rl) {
    if (firstLine) { firstLine = false; continue } // skip header
    if (!line.trim()) continue

    const f = parseLine(line)
    const amm = f[COL.AMM]
    const nom = f[COL.NOM]

    if (!amm || !nom) { skipped++; continue }

    batch.push({
      amm,
      nom_commercial: nom,
      titulaire:    f[COL.TITULAIRE]   || null,
      type_produit: f[COL.FONCTIONS]   || null,
      statut:       f[COL.STATUT]      || null,
      date_amm:     toIso(f[COL.DATE_AMM]),
      date_retrait: toIso(f[COL.DATE_RETRAIT]),
    })

    if (batch.length >= 500) {
      const { error } = await supabase
        .from('produits_phyto')
        .upsert(batch, { onConflict: 'amm' })
      if (error) { console.error('\nErreur :', error.message); process.exit(1) }
      total += batch.length
      process.stdout.write(`\rImporté : ${total} produits…`)
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase
      .from('produits_phyto')
      .upsert(batch, { onConflict: 'amm' })
    if (error) { console.error('\nErreur :', error.message); process.exit(1) }
    total += batch.length
  }

  console.log(`\n✓ ${total} produits importés (${skipped} lignes ignorées)`)
}

main().catch(err => { console.error(err); process.exit(1) })
