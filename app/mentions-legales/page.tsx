import Link from 'next/link'

export const metadata = { title: 'Mentions légales — iParcel' }

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-100 p-8">
        <Link href="/" className="text-xs text-gray-600 hover:underline mb-6 inline-block">← Retour</Link>
        <h1 className="text-xl font-bold text-gray-900 mb-8">Mentions légales</h1>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Éditeur du site</h2>
          <p className="text-sm text-gray-600">
            Jules Videgrain<br />
            Particulier — projet personnel<br />
            Contact : <a href="mailto:jv9994@icloud.com" className="text-gray-600 hover:underline">jv9994@icloud.com</a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Hébergement</h2>
          <p className="text-sm text-gray-600">
            Vercel Inc.<br />
            340 Pine Street, Suite 701<br />
            San Francisco, CA 94104, États-Unis<br />
            <a href="https://vercel.com" className="text-gray-600 hover:underline" target="_blank" rel="noopener noreferrer">vercel.com</a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Hébergement des données</h2>
          <p className="text-sm text-gray-600">
            Les données utilisateurs (comptes et parcelles) sont hébergées par Supabase, Inc.
            sur des serveurs Amazon Web Services (région us-east-1, États-Unis).<br />
            <a href="https://supabase.com" className="text-gray-600 hover:underline" target="_blank" rel="noopener noreferrer">supabase.com</a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Propriété intellectuelle</h2>
          <p className="text-sm text-gray-600 mb-2">
            iParcel est un projet personnel. Les images satellitaires affichées sont issues du
            programme Copernicus de l'Agence Spatiale Européenne (ESA) — données Sentinel-2,
            distribuées via l'API publique Element 84 Earth Search. Leur usage est libre
            conformément à la Licence Copernicus.
          </p>
          <p className="text-sm text-gray-600">
            Les données météorologiques sont fournies par{' '}
            <a href="https://open-meteo.com" className="text-gray-600 hover:underline" target="_blank" rel="noopener noreferrer">Open-Meteo</a>,
            sous licence{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="text-gray-600 hover:underline" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Responsabilité</h2>
          <p className="text-sm text-gray-600">
            iParcel est un outil de consultation d'images satellitaires à titre indicatif.
            L'éditeur ne saurait être tenu responsable d'une utilisation agronomique ou
            décisionnelle fondée sur les données affichées.
          </p>
        </section>
      </div>
    </div>
  )
}
