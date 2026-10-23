import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Mentions légales — iParcel' }

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales">
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Éditeur du site</h2>
        <p className="text-sm text-ink-2">
          Jules Videgrain<br />
          Particulier — projet personnel<br />
          Directeur de la publication : Jules Videgrain<br />
          Contact : <a href="mailto:jv9994@icloud.com" className="text-ink-2">jv9994@icloud.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Hébergement</h2>
        <p className="text-sm text-ink-2">
          Vercel Inc.<br />
          440 N Barranca Avenue #4133<br />
          Covina, CA 91723, États-Unis<br />
          <a href="https://vercel.com" className="text-ink-2" target="_blank" rel="noopener noreferrer">vercel.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Hébergement des données</h2>
        <p className="text-sm text-ink-2">
          Les données utilisateurs (comptes et parcelles) sont hébergées par Supabase, Inc.
          sur des serveurs Amazon Web Services situés en Irlande (région eu-west-1, Union européenne).<br />
          <a href="https://supabase.com" className="text-ink-2" target="_blank" rel="noopener noreferrer">supabase.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Propriété intellectuelle</h2>
        <p className="text-sm text-ink-2 mb-2">
          iParcel est un projet personnel. Les images satellitaires affichées sont issues du
          programme Copernicus de l’Agence Spatiale Européenne (ESA) — données Sentinel-2,
          distribuées via l’API publique Element 84 Earth Search. Leur usage est libre
          conformément à la Licence Copernicus : les images affichées contiennent des données
          Copernicus Sentinel modifiées.
        </p>
        <p className="text-sm text-ink-2 mb-2">
          Le fond de carte satellite est fourni par Esri (World Imagery) et ses partenaires
          (Maxar, Earthstar Geographics). La recherche de lieux utilise la Géoplateforme de l’IGN.
        </p>
        <p className="text-sm text-ink-2">
          Les données météorologiques sont fournies par{' '}
          <a href="https://open-meteo.com" className="text-ink-2" target="_blank" rel="noopener noreferrer">Open-Meteo</a>,
          sous licence{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="text-ink-2" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Responsabilité</h2>
        <p className="text-sm text-ink-2">
          iParcel est un outil de consultation d’images satellitaires à titre indicatif.
          L’éditeur ne saurait être tenu responsable d’une utilisation agronomique ou
          décisionnelle fondée sur les données affichées.
        </p>
      </section>
    </LegalPage>
  )
}
