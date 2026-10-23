import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Politique de confidentialité — iParcel' }

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updated="23 octobre 2026">
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Responsable du traitement</h2>
        <p className="text-sm text-ink-2">
          Jules Videgrain — <a href="mailto:jv9994@icloud.com" className="text-ink-2">jv9994@icloud.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Données collectées</h2>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li><strong>Adresse e-mail</strong> — pour la création et l’authentification de votre compte.</li>
          <li><strong>Coordonnées géographiques de vos parcelles</strong> — polygones dessinés sur la carte, stockés en base de données.</li>
          <li><strong>Noms de parcelles</strong> — librement saisis par l’utilisateur.</li>
          <li><strong>Données techniques</strong> — adresse IP, type de navigateur, date et heure des connexions, enregistrées par nos prestataires pour la sécurité du service.</li>
        </ul>
        <p className="text-sm text-ink-2 mt-2">
          Les coordonnées géographiques du centroïde de chaque parcelle (latitude et longitude)
          sont transmises au service Open-Meteo pour obtenir les données météorologiques locales.
          Aucun identifiant utilisateur n’est joint à cette requête.
          Aucune donnée de paiement ni donnée sensible n’est collectée.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Le texte saisi dans la recherche de lieu est transmis à la Géoplateforme de l’IGN pour
          trouver la commune ou l’adresse correspondante, sans identifiant utilisateur.
          Si vous utilisez le bouton « Me localiser », la position de votre appareil sert
          uniquement à centrer la carte : elle n’est ni transmise ni enregistrée.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Finalités du traitement</h2>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li>Authentification et accès sécurisé au service</li>
          <li>Sauvegarde et affichage de vos parcelles</li>
          <li>Consultation des images satellitaires Sentinel-2 correspondantes</li>
          <li>Affichage des données météorologiques locales à la parcelle</li>
          <li>Protection contre les robots et les tentatives d’intrusion</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Base légale</h2>
        <p className="text-sm text-ink-2">
          Exécution du contrat (article 6.1.b du RGPD) — les données de compte et de parcelles
          sont nécessaires au fonctionnement du service auquel vous vous êtes inscrit.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Intérêt légitime (article 6.1.f du RGPD) — les données techniques et la vérification
          anti-robot servent à protéger le service et les comptes contre les abus.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Sous-traitants</h2>
        <div className="text-sm text-ink-2 space-y-2">
          <div>
            <strong>Supabase, Inc.</strong> (données hébergées en Irlande, AWS eu-west-1) — stockage
            des comptes et des parcelles, journaux de connexion. Supabase étant une société
            américaine, un accès depuis les États-Unis reste possible pour le support : il est
            encadré par les clauses contractuelles types de la Commission européenne. <a href="https://supabase.com/privacy" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Supabase</a>
          </div>
          <div>
            <strong>Vercel, Inc.</strong> (États-Unis) — hébergement de l’application, journaux
            techniques (adresse IP). Transfert encadré par le Data Privacy Framework UE–États-Unis.{' '}
            <a href="https://vercel.com/legal/privacy-policy" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Vercel</a>
          </div>
          <div>
            <strong>Cloudflare, Inc.</strong> (États-Unis) — vérification anti-robot Turnstile sur la
            page de connexion. Cloudflare reçoit l’adresse IP et des caractéristiques techniques du
            navigateur, sans cookie publicitaire.{' '}
            <a href="https://www.cloudflare.com/turnstile-privacy-policy/" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Turnstile</a>
          </div>
          <div>
            <strong>Element 84 / Amazon Web Services</strong> (États-Unis) — fourniture des images
            satellitaires publiques Sentinel-2. Votre navigateur transmet l’emprise de la parcelle
            consultée et votre adresse IP, sans identifiant utilisateur.
          </div>
          <div>
            <strong>Open-Meteo</strong> (Suisse) — fourniture des données météorologiques.
            Le centroïde de la parcelle (latitude/longitude) et votre adresse IP sont transmis,
            sans identifiant utilisateur ; Open-Meteo efface ses journaux après 90 jours.{' '}
            <a href="https://open-meteo.com/en/terms" className="text-ink-2" target="_blank" rel="noopener noreferrer">Conditions Open-Meteo</a>
          </div>
          <div>
            <strong>IGN, Géoplateforme</strong> (France) — recherche de communes et d’adresses.
            Le texte saisi dans la recherche et votre adresse IP sont transmis, sans identifiant utilisateur.{' '}
            <a href="https://geoservices.ign.fr/cgu-licences" className="text-ink-2" target="_blank" rel="noopener noreferrer">Conditions IGN</a>
          </div>
          <div>
            <strong>Esri</strong> (États-Unis) — fond de carte satellite. Les tuiles sont chargées
            directement par votre navigateur, qui transmet votre adresse IP et la zone affichée ;
            aucune donnée de compte n’est transmise.
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Durée de conservation</h2>
        <p className="text-sm text-ink-2">
          Vos données de compte et de parcelles sont conservées tant que votre compte existe.
          La suppression du compte les efface immédiatement de la base ; les copies de
          sauvegarde éventuelles disparaissent dans les 30 jours. Les journaux techniques sont
          conservés par chaque prestataire pour une durée limitée, 90 jours au plus.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Vos droits</h2>
        <p className="text-sm text-ink-2 mb-2">
          Conformément au RGPD, vous disposez des droits suivants :
        </p>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li><strong>Droit d’accès</strong> — demander une copie de vos données</li>
          <li><strong>Droit de rectification</strong> — corriger des données inexactes</li>
          <li><strong>Droit à l’effacement</strong> — supprimer votre compte directement depuis l’interface (menu du compte, « Supprimer mon compte »), ce qui efface immédiatement toutes vos données</li>
          <li><strong>Droit à la portabilité</strong> — obtenir vos données dans un format structuré</li>
          <li><strong>Droit à la limitation</strong> — demander la suspension d’un traitement</li>
          <li><strong>Droit d’opposition</strong> — vous opposer à un traitement fondé sur l’intérêt légitime</li>
          <li><strong>Directives après le décès</strong> — définir le sort de vos données après votre décès (article 85 de la loi Informatique et Libertés)</li>
        </ul>
        <p className="text-sm text-ink-2 mt-2">
          Pour exercer ces droits (hors suppression déjà disponible dans l’interface) :
          <a href="mailto:jv9994@icloud.com" className="text-ink-2 ml-1">jv9994@icloud.com</a>.
          Une réponse vous est apportée dans un délai d’un mois.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Vous pouvez également introduire une réclamation auprès de la CNIL :
          <a href="https://www.cnil.fr" className="text-ink-2 ml-1" target="_blank" rel="noopener noreferrer">cnil.fr</a>
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Cookies et stockage local</h2>
        <p className="text-sm text-ink-2">
          iParcel ne dépose aucun cookie publicitaire ni de mesure d’audience. Votre session de
          connexion est enregistrée dans le stockage local de votre navigateur (géré par Supabase)
          et la vérification anti-robot Cloudflare peut utiliser des traceurs de sécurité. Ces
          traceurs sont strictement nécessaires au service demandé : ils sont dispensés de
          consentement (article 82 de la loi Informatique et Libertés). La déconnexion efface
          la session.
        </p>
      </section>
    </LegalPage>
  )
}
