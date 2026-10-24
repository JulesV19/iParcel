import { headers } from 'next/headers'
import Link from 'next/link'
import LegalPage from '@/components/LegalPage'
import CopyField from '@/components/CopyField'
import { MCP_PATH } from '@/lib/mcp/auth'
import { CLAUDE_CODE_CALLBACK_PORT, MCP_CLIENTS } from '@/lib/mcp/clients'

export const metadata = { title: 'Connecter une IA — iParcel' }

export default async function Connecter() {
  const host = (await headers()).get('host') ?? 'i-parcel.vercel.app'
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const serverUrl = `${local ? 'http' : 'https'}://${host}${MCP_PATH}`
  const { claude, claudeCode, vscode, cursor } = MCP_CLIENTS

  return (
    <LegalPage title="Connecter une IA">
      <section className="mb-8">
        <p className="text-sm text-ink-2">
          Un assistant IA connecté à iParcel peut lire vos parcelles, leurs images satellite, leurs
          indices de végétation et leur météo pour rédiger des rapports. Il ne peut rien modifier.
          Votre autorisation vous est demandée à la première connexion ; vous pouvez la retirer à
          tout moment depuis <Link href="/applications">Applications connectées</Link>.
        </p>
        <p className="mt-2 text-sm text-ink-2">
          Les données lues sont transmises à l’éditeur de l’assistant, qui les traite selon ses propres
          conditions. Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>

      {claude && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">Claude (web, ordinateur et mobile)</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-ink-2">
            <li>Sur claude.ai, ouvrez Paramètres → Connecteurs → Ajouter un connecteur personnalisé.</li>
            <li>Nom : iParcel. Collez l’adresse du serveur.</li>
            <li>Dans Paramètres avancés, collez l’identifiant client. Laissez le secret vide.</li>
            <li>Ajoutez le connecteur, cliquez sur Se connecter, puis autorisez l’accès.</li>
          </ol>
          <CopyField label="Adresse du serveur" value={serverUrl} />
          <CopyField label="Identifiant client (OAuth Client ID)" value={claude} />
        </section>
      )}

      {claudeCode && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">Claude Code</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-ink-2">
            <li>Lancez cette commande dans un terminal.</li>
            <li>Dans Claude Code, tapez /mcp, choisissez iparcel, puis authentifiez-vous.</li>
          </ol>
          <CopyField
            label="Commande"
            multiline
            value={`claude mcp add --transport http --scope user --client-id ${claudeCode} --callback-port ${CLAUDE_CODE_CALLBACK_PORT} iparcel ${serverUrl}`}
          />
        </section>
      )}

      {vscode && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">VS Code</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-ink-2">
            <li>Ouvrez la palette de commandes, puis MCP: Add Server → HTTP, et collez l’adresse du serveur.</li>
            <li>Quand VS Code demande un identifiant client, collez celui ci-dessous.</li>
          </ol>
          <CopyField label="Adresse du serveur" value={serverUrl} />
          <CopyField label="Identifiant client" value={vscode} />
        </section>
      )}

      {cursor && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">Cursor</h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-ink-2">
            <li>Ajoutez ce serveur dans le fichier ~/.cursor/mcp.json.</li>
            <li>Dans les réglages MCP de Cursor, cliquez sur Connect à côté d’iparcel.</li>
          </ol>
          <CopyField
            label="mcp.json"
            multiline
            value={JSON.stringify({ mcpServers: { iparcel: { url: serverUrl, auth: { CLIENT_ID: cursor } } } }, null, 2)}
          />
        </section>
      )}

      {!claude && !claudeCode && !vscode && !cursor && (
        <p className="rounded-xl bg-paper-2 px-3.5 py-2.5 text-sm text-ink-2">Aucun assistant n’est encore disponible.</p>
      )}
    </LegalPage>
  )
}
