import Link from 'next/link'

export const metadata = { title: 'Politique de confidentialité — iParcel' }

export default function Confidentialite() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-100 p-8">
        <Link href="/" className="text-xs text-green-700 hover:underline mb-6 inline-block">← Retour</Link>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
        <p className="text-xs text-gray-400 mb-8">Dernière mise à jour : 9 mai 2026</p>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Responsable du traitement</h2>
          <p className="text-sm text-gray-600">
            Jules Videgrain — <a href="mailto:jv9994@icloud.com" className="text-green-700 hover:underline">jv9994@icloud.com</a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Données collectées</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li><strong>Adresse e-mail</strong> — pour la création et l'authentification de votre compte.</li>
            <li><strong>Coordonnées géographiques de vos parcelles</strong> — polygones dessinés sur la carte, stockés en base de données.</li>
            <li><strong>Noms de parcelles</strong> — librement saisis par l'utilisateur.</li>
            <li><strong>Notes de terrain</strong> — textes libres saisis par l'utilisateur, associés à une parcelle et datés automatiquement.</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            Les coordonnées géographiques du centroïde de chaque parcelle (latitude et longitude)
            sont transmises au service Open-Meteo pour obtenir les données météorologiques locales.
            Aucun identifiant utilisateur n'est joint à cette requête.
            Aucune donnée de paiement ni donnée sensible n'est collectée.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Finalités du traitement</h2>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Authentification et accès sécurisé au service</li>
            <li>Sauvegarde et affichage de vos parcelles</li>
            <li>Consultation des images satellitaires Sentinel-2 correspondantes</li>
            <li>Affichage des données météorologiques locales à la parcelle</li>
            <li>Enregistrement et consultation de vos notes de terrain</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Base légale</h2>
          <p className="text-sm text-gray-600">
            Exécution du contrat (article 6.1.b du RGPD) — les données sont nécessaires
            au fonctionnement du service auquel vous vous êtes inscrit.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sous-traitants</h2>
          <div className="text-sm text-gray-600 space-y-2">
            <div>
              <strong>Supabase, Inc.</strong> (États-Unis, AWS us-east-1) — stockage des comptes
              et des parcelles. Transfert encadré par les clauses contractuelles types de la Commission
              européenne. <a href="https://supabase.com/privacy" className="text-green-700 hover:underline" target="_blank" rel="noopener noreferrer">Politique Supabase</a>
            </div>
            <div>
              <strong>Vercel, Inc.</strong> (États-Unis) — hébergement de l'application.{' '}
              <a href="https://vercel.com/legal/privacy-policy" className="text-green-700 hover:underline" target="_blank" rel="noopener noreferrer">Politique Vercel</a>
            </div>
            <div>
              <strong>Element 84 / AWS</strong> — fourniture des images satellitaires publiques
              Sentinel-2. Données non personnelles.
            </div>
            <div>
              <strong>Open-Meteo</strong> (Allemagne) — fourniture des données météorologiques.
              Seul le centroïde géographique de la parcelle (latitude/longitude) est transmis,
              sans identifiant utilisateur.{' '}
              <a href="https://open-meteo.com/en/terms" className="text-green-700 hover:underline" target="_blank" rel="noopener noreferrer">Conditions Open-Meteo</a>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Durée de conservation</h2>
          <p className="text-sm text-gray-600">
            Vos données sont conservées tant que votre compte est actif. Elles sont
            intégralement supprimées dans les 30 jours suivant la suppression de votre compte
            (voir ci-dessous).
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Vos droits</h2>
          <p className="text-sm text-gray-600 mb-2">
            Conformément au RGPD, vous disposez des droits suivants :
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li><strong>Droit d'accès</strong> — demander une copie de vos données</li>
            <li><strong>Droit de rectification</strong> — corriger des données inexactes</li>
            <li><strong>Droit à l'effacement</strong> — supprimer votre compte directement depuis l'interface (bouton "Supprimer mon compte"), ce qui efface immédiatement toutes vos données</li>
            <li><strong>Droit à la portabilité</strong> — obtenir vos données dans un format structuré</li>
            <li><strong>Droit d'opposition</strong> — vous opposer à un traitement</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            Pour exercer ces droits (hors suppression déjà disponible dans l'interface) :
            <a href="mailto:jv9994@icloud.com" className="text-green-700 hover:underline ml-1">jv9994@icloud.com</a>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Vous pouvez également introduire une réclamation auprès de la CNIL :
            <a href="https://www.cnil.fr" className="text-green-700 hover:underline ml-1" target="_blank" rel="noopener noreferrer">cnil.fr</a>
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Cookies</h2>
          <p className="text-sm text-gray-600">
            iParcel utilise uniquement un cookie de session technique nécessaire à
            l'authentification (géré par Supabase). Aucun cookie publicitaire ni traceur
            tiers n'est utilisé.
          </p>
        </section>
      </div>
    </div>
  )
}
