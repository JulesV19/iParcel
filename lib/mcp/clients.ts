// Clients OAuth publics enregistrés dans Supabase, un par outil d'IA. Un identifiant de client
// public n'est pas un secret : il est affiché sur la page /connecter
export const MCP_CLIENTS = {
  claude: process.env.MCP_CLIENT_ID_CLAUDE ?? '',
  claudeCode: process.env.MCP_CLIENT_ID_CLAUDE_CODE ?? '',
  vscode: process.env.MCP_CLIENT_ID_VSCODE ?? '',
  cursor: process.env.MCP_CLIENT_ID_CURSOR ?? '',
}

// Port de retour fixe pour Claude Code : Supabase compare l'adresse de retour au caractère près
export const CLAUDE_CODE_CALLBACK_PORT = 8977
