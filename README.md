# visbug-mcp

Pont entre **VisBug** (édition visuelle dans Chrome) et **Claude Code** via MCP.

## Architecture

```
Chrome (VisBug)
  └─ content-script.js  →  WebSocket :4844  →  node src/server.js
                                                     └─ MCP stdio  →  Claude Code
```

Il y a deux modes de lancement distincts :
- **MCP stdio** → lancé par Claude Code directement via `node src/server.js`
- **WebSocket :4844** → le même process, Claude Code le démarre, le browser s'y connecte

## Démarrage rapide

### 1. Installer les dépendances

```bash
cd /Users/mehdiambari/Developer/NNP/Git/Tools/visbug-mcp
npm install
```

### 2. Enregistrer dans Claude Code

```bash
claude mcp add visbug-mcp -- node /Users/mehdiambari/Developer/NNP/Git/Tools/visbug-mcp/src/server.js
```

Ou manuellement dans `.claude.json` de ton projet SAAS :

```json
{
  "mcpServers": {
    "visbug-mcp": {
      "command": "node",
      "args": ["/Users/mehdiambari/Developer/NNP/Git/Tools/visbug-mcp/src/server.js"]
    }
  }
}
```

### 3. Extension Chrome

1. Ouvre `chrome://extensions`
2. Active le **mode développeur**
3. Clique **"Charger l'extension non empaquetée"**
4. Sélectionne le dossier `extension/`

## Utilisation

1. Lance ton app Vue : `npm run dev`
2. Ouvre `http://localhost:8000` dans Chrome
3. Active VisBug et modifie des éléments visuellement
4. Dans Claude Code :

```
Applique les modifications VisBug capturées dans les fichiers source
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_changes` | Retourne toutes les mutations capturées (JSON) |
| `apply_changes` | Marque des changements comme appliqués |
| `clear_changes` | Vide le buffer |

## Structure

```
visbug-mcp/
├── Dockerfile            # optionnel, pour déploiement
├── docker-compose.yml    # optionnel, pour déploiement
├── package.json
├── README.md
├── src/
│   ├── server.js          # WebSocket + MCP server (stdio)
│   └── parser.js          # Normalise et déduplique les mutations
└── extension/
    ├── manifest.json
    ├── content-script.js  # Observer DOM → WebSocket
    ├── background.js
    ├── popup.html
    └── popup.js
```
