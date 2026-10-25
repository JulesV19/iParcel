import Link from 'next/link'
import LegalPage from '@/components/LegalPage'

export const metadata = { title: 'Politique de confidentialité — iParcel' }

export default function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updated="25 octobre 2026">
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Responsable du traitement</h2>
        <p className="text-sm text-ink-2">
          Jules Videgrain — <a href="mailto:jv9994@icloud.com" className="text-ink-2">jv9994@icloud.com</a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Données collectées</h2>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li><strong>Adresse e-mail</strong> — pour la création et l’authentification de votre compte, et l’envoi des e-mails de confirmation d’inscription et de réinitialisation du mot de passe.</li>
          <li><strong>Coordonnées géographiques de vos parcelles</strong> — polygones dessinés sur la carte, stockés en base de données.</li>
          <li><strong>Noms de parcelles</strong> — librement saisis par l’utilisateur.</li>
          <li><strong>Données techniques</strong> — adresse IP, type de navigateur, date et heure des connexions, enregistrées par nos prestataires pour la sécurité du service.</li>
          <li>
            <strong>Applications connectées</strong>, seulement si vous en autorisez une — l’application
            autorisée et la date de l’autorisation ; la session de connexion de l’application (adresse IP
            et logiciel à l’origine de la demande, dates) ; un journal d’activité. Le journal indique, pour
            chaque lecture, la date, l’application, l’outil utilisé, la parcelle concernée et le résultat.
            Il ne contient ni adresse IP, ni les données renvoyées, ni le contenu de vos conversations
            avec l’assistant.
          </li>
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
          <li>Transmission de vos données aux applications que vous avez autorisées, par exemple un assistant IA qui rédige des rapports</li>
          <li>Traçabilité des accès des applications connectées et limitation de leur nombre d’appels</li>
          <li>Protection contre les robots et les tentatives d’intrusion</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Base légale</h2>
        <p className="text-sm text-ink-2">
          Exécution du contrat (article 6.1.b du RGPD) — les données de compte et de parcelles
          sont nécessaires au fonctionnement du service auquel vous vous êtes inscrit. La
          transmission à une application connectée est faite à votre demande, quand vous
          l’autorisez.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Intérêt légitime (article 6.1.f du RGPD) — les données techniques, la vérification
          anti-robot, le journal d’activité et les limites d’appels servent à protéger le service et
          les comptes contre les abus.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Applications connectées (assistants IA)</h2>
        <div className="text-sm text-ink-2 space-y-2">
          <p>
            Cette fonction est facultative. Vous pouvez autoriser un assistant IA à lire vos données
            iParcel (voir <Link href="/connecter">Connecter une IA</Link>). L’autorisation vous est
            demandée sur un écran iParcel qui indique l’application et ce qu’elle pourra lire. Rien
            n’est transmis sans cette autorisation.
          </p>
          <p>
            <strong>Ce que l’application peut lire :</strong> le nom, le contour, la surface et le
            centroïde de vos parcelles, la liste des images satellite disponibles, les indices de
            végétation calculés et la météo locale. L’accès est en lecture seule : l’application ne
            peut ni modifier vos parcelles ni agir sur votre compte. Votre adresse e-mail ne lui est
            transmise que si elle la demande et que l’écran d’autorisation l’indique.
          </p>
          <p>
            <strong>Qui reçoit ces données :</strong> l’éditeur de l’application, qui les traite
            sous sa propre responsabilité et selon sa propre politique de confidentialité. Pour
            Claude, il s’agit d’Anthropic (Anthropic Ireland, Limited pour les utilisateurs de
            l’Espace économique européen), dont les traitements peuvent avoir lieu hors de l’Union
            européenne, notamment aux États-Unis :{' '}
            <a href="https://www.anthropic.com/legal/privacy" className="text-ink-2" target="_blank" rel="noopener noreferrer">politique Anthropic</a>.
            Cette transmission se fait à votre initiative, vers le service que vous avez choisi.
            iParcel ne reçoit pas vos conversations avec l’assistant, n’utilise pas vos données pour
            entraîner une IA et ne les vend pas.
          </p>
          <p>
            <strong>Pour répondre à l’application</strong>, le serveur iParcel, hébergé par Vercel à
            Dublin (Irlande), interroge Element 84 (emprise de la parcelle) et Open-Meteo (centroïde)
            avec sa propre adresse IP, sans identifiant utilisateur.
          </p>
          <p>
            <strong>Retirer l’accès :</strong> depuis la page{' '}
            <Link href="/applications">Applications connectées</Link>, accessible dans le menu du
            compte. L’accès est coupé immédiatement. Cette page affiche aussi le journal d’activité.
            Les données déjà transmises restent chez l’application : pour les effacer, adressez-vous
            à son éditeur (dans Claude, en supprimant les conversations concernées).
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Sous-traitants</h2>
        <div className="text-sm text-ink-2 space-y-2">
          <div>
            <strong>Supabase Pte. Ltd.</strong> (Singapour ; données hébergées en Irlande, AWS
            eu-west-1) — stockage des comptes, des parcelles et du journal d’activité, gestion des
            autorisations des applications connectées, journaux de connexion. Un accès depuis
            l’extérieur de l’Union européenne reste possible pour le support : il est encadré par les
            clauses contractuelles types de la Commission européenne, intégrées à l’accord de
            traitement des données de Supabase. <a href="https://supabase.com/privacy" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Supabase</a>
          </div>
          <div>
            <strong>Vercel, Inc.</strong> (États-Unis) — hébergement de l’application, journaux
            techniques (adresse IP). Le serveur des applications connectées s’exécute à Dublin
            (Irlande). Transfert encadré par le Data Privacy Framework UE–États-Unis.{' '}
            <a href="https://vercel.com/legal/privacy-policy" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Vercel</a>
          </div>
          <div>
            <strong>Cloudflare, Inc.</strong> (États-Unis) — vérification anti-robot Turnstile sur la
            page de connexion. Cloudflare reçoit l’adresse IP et des caractéristiques techniques du
            navigateur, sans cookie publicitaire. Transfert encadré par le Data Privacy Framework
            UE–États-Unis.{' '}
            <a href="https://www.cloudflare.com/turnstile-privacy-policy/" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Turnstile</a>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Autres destinataires</h2>
        <div className="text-sm text-ink-2 space-y-2">
          <p>
            Ces services fournissent un contenu ou une fonction à iParcel et traitent les données
            reçues sous leur propre responsabilité, selon leurs conditions.
          </p>
          <div>
            <strong>Google LLC</strong> (États-Unis) — envoi des e-mails de confirmation
            d’inscription et de réinitialisation du mot de passe depuis une adresse Gmail : Google
            reçoit votre adresse e-mail et le message. Transfert encadré par le Data Privacy
            Framework UE–États-Unis.{' '}
            <a href="https://policies.google.com/privacy" className="text-ink-2" target="_blank" rel="noopener noreferrer">Politique Google</a>
          </div>
          <div>
            <strong>Element 84 / Amazon Web Services</strong> (États-Unis) — fourniture des images
            satellitaires publiques Sentinel-2. Votre navigateur transmet l’emprise de la parcelle
            consultée et votre adresse IP, sans identifiant utilisateur. Pour les applications
            connectées, c’est le serveur iParcel qui transmet l’emprise, sans votre adresse IP.
          </div>
          <div>
            <strong>Open-Meteo</strong> (Suisse) — fourniture des données météorologiques.
            Le centroïde de la parcelle (latitude/longitude) et votre adresse IP sont transmis,
            sans identifiant utilisateur ; pour les applications connectées, seule l’adresse IP du
            serveur iParcel est transmise. Open-Meteo efface ses journaux après 90 jours.{' '}
            <a href="https://open-meteo.com/en/terms" className="text-ink-2" target="_blank" rel="noopener noreferrer">Conditions Open-Meteo</a>
          </div>
          <div>
            <strong>IGN, Géoplateforme</strong> (France) — fond de carte (photographies aériennes,
            noms de lieux), contours des parcelles déclarées à la PAC (registre parcellaire
            graphique) et recherche de communes et d’adresses. Votre navigateur
            transmet votre adresse IP, la zone affichée et le texte saisi dans la recherche, sans
            identifiant utilisateur.{' '}
            <a href="https://geoservices.ign.fr/cgu-licences" className="text-ink-2" target="_blank" rel="noopener noreferrer">Conditions IGN</a>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Durée de conservation</h2>
        <p className="text-sm text-ink-2">
          Vos données de compte et de parcelles sont conservées tant que votre compte existe.
          La suppression du compte les efface immédiatement de la base, avec les autorisations et
          le journal d’activité des applications connectées ; les copies de sauvegarde éventuelles
          disparaissent dans les 30 jours. Les journaux techniques sont conservés par chaque
          prestataire pour une durée limitée, 90 jours au plus.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Applications connectées : l’autorisation et la session sont conservées jusqu’à ce que
          vous retiriez l’accès. Chaque entrée du journal d’activité est effacée au bout d’un an.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Sécurité</h2>
        <p className="text-sm text-ink-2">
          Les échanges sont chiffrés (HTTPS). Chaque compte n’accède qu’à ses propres données,
          contrôle appliqué par la base de données elle-même. Seules les applications
          explicitement acceptées par iParcel peuvent demander une autorisation. Elles reçoivent un
          accès en lecture seule, valable une heure et renouvelé tant que vous ne l’avez pas retiré.
          En cas de violation de données présentant un risque pour vous, la CNIL est notifiée sous
          72 heures et vous êtes informé dans les meilleurs délais.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-ink mb-2">Vos droits</h2>
        <p className="text-sm text-ink-2 mb-2">
          Conformément au RGPD, vous disposez des droits suivants :
        </p>
        <ul className="text-sm text-ink-2 space-y-1 list-disc list-inside">
          <li><strong>Droit d’accès</strong> — demander une copie de vos données ; le journal d’activité des applications connectées est consultable directement sur la page <Link href="/applications">Applications connectées</Link></li>
          <li><strong>Droit de rectification</strong> — corriger des données inexactes</li>
          <li><strong>Droit à l’effacement</strong> — supprimer votre compte directement depuis l’interface (menu du compte, « Supprimer mon compte »), ce qui efface immédiatement toutes vos données</li>
          <li><strong>Droit à la portabilité</strong> — exporter vos parcelles au format GeoJSON depuis le menu du compte (« Exporter mes parcelles »), ou obtenir l’ensemble de vos données sur demande</li>
          <li><strong>Droit à la limitation</strong> — demander la suspension d’un traitement</li>
          <li><strong>Droit d’opposition</strong> — vous opposer à un traitement fondé sur l’intérêt légitime ; vous pouvez à tout moment retirer l’accès d’une application connectée</li>
          <li><strong>Directives après le décès</strong> — définir le sort de vos données après votre décès (article 85 de la loi Informatique et Libertés)</li>
        </ul>
        <p className="text-sm text-ink-2 mt-2">
          Pour exercer ces droits (hors suppression, export et retrait d’accès, déjà disponibles dans l’interface) :
          <a href="mailto:jv9994@icloud.com" className="text-ink-2 ml-1">jv9994@icloud.com</a>.
          Une réponse vous est apportée dans un délai d’un mois.
        </p>
        <p className="text-sm text-ink-2 mt-2">
          Vous pouvez également introduire une réclamation auprès de la CNIL :
          <a href="https://www.cnil.fr" className="text-ink-2 ml-1" target="_blank" rel="noopener noreferrer">cnil.fr</a>
        </p>
      </section>

      <section className="mb-6">
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

      <section>
        <h2 className="text-sm font-semibold text-ink mb-2">Modifications</h2>
        <p className="text-sm text-ink-2">
          Cette politique peut évoluer avec le service ; la date de dernière mise à jour figure en
          haut de la page. En cas de modification importante, vous en êtes informé par e-mail.
        </p>
      </section>
    </LegalPage>
  )
}
