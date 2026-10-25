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
          Téléphone : +1 951 383 6898<br />
          <a href="https://vercel.com" className="text-ink-2" target="_blank" rel="noopener noreferrer">vercel.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Hébergement des données</h2>
        <p className="text-sm text-ink-2">
          Les données utilisateurs (comptes et parcelles) sont hébergées par Supabase Pte. Ltd.,
          65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513, sur des serveurs Amazon Web
          Services situés en Irlande (région eu-west-1, Union européenne).<br />
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
          Le fond de carte (photographies aériennes), le plan cadastral (Parcellaire Express) et
          les noms de lieux proviennent de la Géoplateforme de l’IGN, qui fournit aussi la recherche
          de lieux, sous{' '}
          <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" className="text-ink-2" target="_blank" rel="noopener noreferrer">Licence Ouverte Etalab 2.0</a>.
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
          décisionnelle fondée sur les données affichées. Le plan cadastral n’a pas de valeur
          juridique : il ne permet pas d’établir les limites d’une propriété, que seul un bornage
          par un géomètre-expert fixe.
        </p>
      </section>
    </LegalPage>
  )
}
