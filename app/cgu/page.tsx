import Link from 'next/link'
import LegalPage from '@/components/LegalPage'

export const metadata = { title: "Conditions d'utilisation — iParcel" }

export default function CGU() {
  return (
    <LegalPage title="Conditions générales d'utilisation" updated="24 octobre 2026">
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">1. Présentation du service</h2>
        <p className="text-sm text-ink-2">
          iParcel est un service en ligne permettant aux utilisateurs de délimiter des parcelles
          agricoles sur une carte satellite, de consulter les images satellitaires Sentinel-2
          correspondantes et la météo locale de chaque parcelle. L’utilisateur peut aussi
          autoriser un assistant IA à lire ces données pour rédiger des rapports.
          Le service est édité par Jules Videgrain à titre personnel.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">2. Accès au service</h2>
        <p className="text-sm text-ink-2">
          L’accès au service nécessite la création d’un compte avec une adresse e-mail et un
          mot de passe. L’inscription est gratuite. L’utilisateur est responsable de la
          confidentialité de ses identifiants.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">3. Utilisation autorisée</h2>
        <p className="text-sm text-ink-2 mb-2">
          L’utilisateur s’engage à utiliser iParcel conformément à sa destination et à ne pas :
        </p>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li>Tenter de contourner les mécanismes d’authentification ou d’accéder aux données d’autres utilisateurs</li>
          <li>Utiliser le service à des fins illicites ou pour stocker des données à caractère personnel de tiers sans leur consentement</li>
          <li>Surcharger le service par des requêtes automatisées non autorisées</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">4. Données satellitaires</h2>
        <p className="text-sm text-ink-2">
          Les images satellitaires affichées sont issues du programme Copernicus (ESA),
          données Sentinel-2, distribuées via l’API publique Element 84 Earth Search.
          Ces données sont fournies à titre indicatif. iParcel ne garantit pas leur
          exhaustivité, leur actualité ou leur précision géométrique.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">5. Applications connectées</h2>
        <p className="text-sm text-ink-2 mb-2">
          L’utilisateur peut autoriser un assistant IA proposé sur la page{' '}
          <Link href="/connecter" className="text-ink-2">Connecter une IA</Link> à lire ses parcelles,
          leurs images satellite, leurs indices de végétation et leur météo. Cet accès est
          facultatif, en lecture seule, et peut être retiré à tout moment depuis la page{' '}
          <Link href="/applications" className="text-ink-2">Applications connectées</Link>.
        </p>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li>L’assistant est un service tiers, soumis aux conditions de son éditeur, que l’utilisateur accepte auprès de celui-ci.</li>
          <li>Les données lues sont transmises à cet éditeur ; leur traitement par l’assistant ne relève pas d’iParcel.</li>
          <li>Le nombre de lectures est limité par minute et par jour pour préserver le service.</li>
          <li>L’éditeur d’iParcel peut retirer un assistant de la liste des applications acceptées, notamment pour des raisons de sécurité.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">6. Limitation de responsabilité</h2>
        <p className="text-sm text-ink-2">
          iParcel est un outil d’aide à la visualisation. L’éditeur ne saurait être tenu
          responsable des décisions agronomiques, administratives ou commerciales prises sur
          la base des informations affichées, ni du contenu des rapports et réponses rédigés par
          un assistant IA, qui peuvent contenir des erreurs et doivent être vérifiés. Le service
          est fourni « tel quel », sans garantie de disponibilité continue.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">7. Suppression du compte</h2>
        <p className="text-sm text-ink-2">
          L’utilisateur peut supprimer son compte à tout moment depuis le menu de son compte
          (« Supprimer mon compte »). Cette action supprime immédiatement et
          définitivement toutes ses données (parcelles et compte).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">8. Données personnelles</h2>
        <p className="text-sm text-ink-2">
          Le traitement des données personnelles est décrit dans la{' '}
          <Link href="/confidentialite" className="text-ink-2">politique de confidentialité</Link>.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">9. Modification des CGU</h2>
        <p className="text-sm text-ink-2">
          L’éditeur se réserve le droit de modifier les présentes CGU. Les utilisateurs
          seront informés par e-mail en cas de modification substantielle.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">10. Droit applicable</h2>
        <p className="text-sm text-ink-2">
          Les présentes CGU sont soumises au droit français. En cas de litige,
          les parties s’efforceront de trouver une solution amiable avant tout recours judiciaire.
        </p>
      </section>
    </LegalPage>
  )
}
