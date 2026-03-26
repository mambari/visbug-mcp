/**
 * server.js — MCP server (stdio)
 *
 * Démarré par Claude Code à la demande.
 * Lit et écrit le fichier store (~/.visbug-mcp/changes.json).
 * Le serveur WebSocket est géré séparément par ws-daemon.js.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { formatForClaude } from './parser.js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const STORE_DIR = join(homedir(), '.visbug-mcp')
const STORE_FILE = join(STORE_DIR, 'changes.json')

function readStore() {
  try {
    mkdirSync(STORE_DIR, { recursive: true })
    const data = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    return data.changes ?? []
  } catch {
    return []
  }
}

function writeStore(changes) {
  mkdirSync(STORE_DIR, { recursive: true })
  writeFileSync(STORE_FILE, JSON.stringify({ changes }, null, 2))
}

// ─── MCP ──────────────────────────────────────────────────────────────────────

const mcpServer = new Server(
  { name: 'visbug-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_changes',
      description:
        'Retourne toutes les modifications visuelles capturées par VisBug. '
        + 'Chaque entrée contient : selector CSS, propriété, ancienne valeur, nouvelle valeur, tag HTML, url.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Filtrer par type : "style" | "attribute" | "text" | "node-added" | "node-removed". Optionnel.',
          },
        },
      },
    },
    {
      name: 'apply_changes',
      description: 'Marque les changements comme appliqués après écriture dans les fichiers source.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Indices des changements à marquer. Vide = tous.',
          },
        },
      },
    },
    {
      name: 'clear_changes',
      description: 'Vide complètement le buffer de changements.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  if (name === 'get_changes') {
    const changes = readStore()
    let result = changes.filter(c => !c.applied)
    if (args?.filter) result = result.filter(c => c.type === args.filter)
    const text = result.length === 0 ? 'Aucun changement.' : formatForClaude(result)
    return { content: [{ type: 'text', text }] }
  }

  if (name === 'apply_changes') {
    const changes = readStore()
    const ids = args?.ids
    if (!ids || ids.length === 0) {
      changes.forEach(c => { c.applied = true })
    } else {
      ids.forEach(i => { if (changes[i]) changes[i].applied = true })
    }
    writeStore(changes)
    return { content: [{ type: 'text', text: `Marqué comme appliqué : ${ids?.length ?? changes.length} changement(s)` }] }
  }

  if (name === 'clear_changes') {
    const changes = readStore()
    const count = changes.length
    writeStore([])
    return { content: [{ type: 'text', text: `Buffer vidé (${count} changement(s) supprimés)` }] }
  }

  throw new Error(`Tool inconnu : ${name}`)
})

const transport = new StdioServerTransport()
await mcpServer.connect(transport)
process.stderr.write('[visbug-mcp] MCP server ready (stdio)\n')