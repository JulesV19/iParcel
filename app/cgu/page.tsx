import Link from 'next/link'

export const metadata = { title: "Conditions d'utilisation — iParcel" }

export default function CGU() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-100 p-8">
        <Link href="/" className="text-xs text-green-700 hover:underline mb-6 inline-block">← Retour</Link>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{"Conditions générales d'utilisation"}</h1>
        <p className="text-xs text-gray-400 mb-8">Dernière mise à jour : 5 mai 2026</p>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">1. Présentation du service</h2>
          <p className="text-sm text-gray-600">
            iParcel est un service en ligne permettant aux utilisateurs de délimiter des parcelles
            agricoles sur une carte satellite et de consulter les images satellitaires Sentinel-2
            correspondantes. Le service est édité par Jules Videgrain à titre personnel.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">2. Accès au service</h2>
          <p className="text-sm text-gray-600">
            L'accès au service nécessite la création d'un compte avec une adresse e-mail et un
            mot de passe. L'inscription est gratuite. L'utilisateur est responsable de la
            confidentialité de ses identifiants.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">3. Utilisation autorisée</h2>
          <p className="text-sm text-gray-600 mb-2">
            L'utilisateur s'engage à utiliser iParcel conformément à sa destination et à ne pas :
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Tenter de contourner les mécanismes d'authentification ou d'accéder aux données d'autres utilisateurs</li>
            <li>Utiliser le service à des fins illicites ou pour stocker des données à caractère personnel de tiers sans leur consentement</li>
            <li>Surcharger le service par des requêtes automatisées non autorisées</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">4. Données satellitaires</h2>
          <p className="text-sm text-gray-600">
            Les images satellitaires affichées sont issues du programme Copernicus (ESA),
            données Sentinel-2, distribuées via l'API publique Element 84 Earth Search.
            Ces données sont fournies à titre indicatif. iParcel ne garantit pas leur
            exhaustivité, leur actualité ou leur précision géométrique.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">5. Limitation de responsabilité</h2>
          <p className="text-sm text-gray-600">
            iParcel est un outil d'aide à la visualisation. L'éditeur ne saurait être tenu
            responsable des décisions agronomiques, administratives ou commerciales prises sur
            la base des informations affichées. Le service est fourni "tel quel", sans garantie
            de disponibilité continue.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">6. Suppression du compte</h2>
          <p className="text-sm text-gray-600">
            L'utilisateur peut supprimer son compte à tout moment depuis son tableau de bord
            (bouton "Supprimer mon compte"). Cette action supprime immédiatement et
            définitivement toutes ses données (parcelles et compte).
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">7. Modification des CGU</h2>
          <p className="text-sm text-gray-600">
            L'éditeur se réserve le droit de modifier les présentes CGU. Les utilisateurs
            seront informés par e-mail en cas de modification substantielle.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">8. Droit applicable</h2>
          <p className="text-sm text-gray-600">
            Les présentes CGU sont soumises au droit français. En cas de litige,
            les parties s'efforceront de trouver une solution amiable avant tout recours judiciaire.
          </p>
        </section>
      </div>
    </div>
  )
}
