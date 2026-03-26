/**
 * visbug-mcp — server.js
 */

import { WebSocketServer } from 'ws'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { parseMutationsToChanges, formatForClaude, clearSeen } from './parser.js'
import { execSync } from 'child_process'

const WS_PORT = 4844

const store = {
  mutations: [],
  changes: [],
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function freePort(port) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`).toString().trim()
    if (pids) {
      pids.split('\n').filter(Boolean).forEach(pid => {
        try { execSync(`kill ${pid}`) } catch {}
      })
      process.stderr.write(`[visbug-mcp] freed port ${port} (killed: ${pids.replace(/\n/g, ' ')})\n`)
    }
  } catch {}
}

freePort(WS_PORT)

const wss = new WebSocketServer({ port: WS_PORT })

wss.on('listening', () => {
  process.stderr.write(`[visbug-mcp] WebSocket listening on ws://127.0.0.1:${WS_PORT}\n`)
})

wss.on('error', (err) => {
  process.stderr.write(`[visbug-mcp] WebSocket error: ${err.message}\n`)
  // Ne pas crasher — le MCP stdio reste fonctionnel même sans WebSocket
})

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.event === 'mutations') {
        store.mutations.push(...msg.mutations)
        const parsed = parseMutationsToChanges(msg.mutations)
        store.changes.push(...parsed)
      }

      if (msg.event === 'popup-ping') {
        ws.send(JSON.stringify({ event: 'stats', total: store.changes.length }))
      }
    } catch (err) {
      process.stderr.write(`[visbug-mcp] parse error: ${err.message}\n`)
    }
  })
})

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
    let result = store.changes.filter(c => !c.applied)
    if (args?.filter) result = result.filter(c => c.type === args.filter)
    const text = result.length === 0 ? 'Aucun changement.' : formatForClaude(result)
    return { content: [{ type: 'text', text }] }
  }

  if (name === 'apply_changes') {
    const ids = args?.ids
    if (!ids || ids.length === 0) {
      store.changes.forEach(c => { c.applied = true })
    } else {
      ids.forEach(i => { if (store.changes[i]) store.changes[i].applied = true })
    }
    return { content: [{ type: 'text', text: `Marqué comme appliqué : ${ids?.length ?? store.changes.length} changement(s)` }] }
  }

  if (name === 'clear_changes') {
    const count = store.changes.length
    store.mutations = []
    store.changes = []
    clearSeen()
    return { content: [{ type: 'text', text: `Buffer vidé (${count} changement(s) supprimés)` }] }
  }

  throw new Error(`Tool inconnu : ${name}`)
})

const transport = new StdioServerTransport()
await mcpServer.connect(transport)
process.stderr.write('[visbug-mcp] MCP server ready (stdio)\n')
