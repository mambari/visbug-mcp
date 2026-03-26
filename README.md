# VisBug MCP Bridge

Capture les modifications visuelles faites avec [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug) et les expose à Claude Code via le protocole MCP.

## Architecture

```
Chrome (VisBug + Extension)
        │  WebSocket ws://127.0.0.1:4844
        ▼
┌─────────────────┐      ~/.visbug-mcp/changes.json
│  ws-daemon.js   │ ◄──────────────────────────────►  src/server.js (MCP stdio)
│  (pm2, always   │                                    └─ démarré par Claude Code
│   running)      │                                       à la demande
└─────────────────┘
```

- **`src/ws-daemon.js`** — serveur WebSocket autonome, tourne en permanence via pm2. Reçoit les mutations de l'extension, les persiste dans `~/.visbug-mcp/changes.json`.
- **`src/server.js`** — serveur MCP (stdio). Démarré par Claude Code à la demande. Lit et écrit le fichier store. N'ouvre pas de WebSocket.
- **`extension/`** — extension Chrome. Injecte un content-script sur `localhost` pour observer les mutations DOM, et expose un popup de contrôle.

---

## Installation

### 1. Dépendances

```bash
cd /path/to/visbug-mcp
npm install
```

### 2. Daemon WebSocket (pm2)

```bash
# Installer pm2 globalement
npm install -g pm2

# Démarrer le daemon
pm2 start src/ws-daemon.js --name visbug-ws

# Démarrage automatique au login Mac
pm2 startup    # copier-coller la commande sudo affichée
pm2 save
```

Le daemon écoute sur `ws://127.0.0.1:4844`. Il se relance automatiquement en cas de crash.

### 3. Extension Chrome

1. Ouvrir `chrome://extensions`
2. Activer le **mode développeur** (toggle en haut à droite)
3. Cliquer **"Charger l'extension non empaquetée"**
4. Sélectionner le dossier `extension/`

Le popup s'affiche via l'icône dans la barre Chrome et indique le statut de connexion au daemon.

### 4. Serveur MCP (Claude Code)

```bash
claude mcp add visbug-mcp -- node /path/to/visbug-mcp/src/server.js
```

Ou manuellement dans `.claude.json` du projet :

```json
{
  "mcpServers": {
    "visbug-mcp": {
      "command": "node",
      "args": ["/path/to/visbug-mcp/src/server.js"]
    }
  }
}
```

---

## Utilisation

### Flux de travail

1. **Ouvrir la page** sur `localhost` dans Chrome — le content-script se connecte automatiquement au daemon
2. **Faire des modifications** avec VisBug (couleurs, espacements, typographie…)
3. **Dans Claude Code**, utiliser `/visbug` ou appeler un outil MCP pour récupérer et appliquer les changements

### Popup Chrome

| Indicateur | Signification |
|---|---|
| 🟢 Connecté au serveur MCP | Daemon en ligne, capture active |
| 🔴 Serveur MCP non démarré | Daemon arrêté — relancer avec `pm2 start src/ws-daemon.js --name visbug-ws` |
| `N mutation(s) capturée(s)` | Nombre de changements en attente (non appliqués) |

| Bouton | Action |
|---|---|
| **Copier les changements** | Copie la liste formatée dans le presse-papier (sans passer par MCP) |
| **Vider les changements** | Efface le store et réinitialise le storage VisBug |

### Outils MCP

#### `get_changes`
Retourne les modifications visuelles capturées (non encore appliquées).

```
Paramètres :
  filter  (optionnel) : "style" | "attribute" | "text" | "node-added" | "node-removed"
```

Exemple de sortie :
```
[0] .card > h2 → CSS: font-size: 18px (était: 16px)
[1] .btn--primary → CSS: background: rgb(59, 130, 246) (était: rgb(99, 102, 241))
[2] #hero-title → texte: "Nouveau titre" (était: "Ancien titre")
```

#### `apply_changes`
Marque des changements comme appliqués (après les avoir écrits dans les fichiers source).

```
Paramètres :
  ids  (optionnel) : tableau d'indices — vide = marquer tout
```

#### `clear_changes`
Vide complètement le store.

---

## Comportement technique

### Période de grâce (2 secondes)

À chaque rechargement de page, VisBug re-applique automatiquement ses changements persistés depuis son propre storage (`chrome.storage.local`). Ces mutations arrivent dans la première seconde et sont indiscernables des actions utilisateur.

Le daemon refuse toutes les mutations reçues dans les **2 premières secondes** après la connexion WebSocket du content-script pour les ignorer.

### Déduplication

Le parser (`src/parser.js`) maintient un `Map` en mémoire (`seen`) indexé par `selector|type|propriété`. Si la même propriété est modifiée plusieurs fois sur le même élément, seule la dernière valeur est conservée.

### Persistance (file store)

Les changements sont sauvegardés dans `~/.visbug-mcp/changes.json` après chaque nouvelle mutation. Ce fichier est la **source de vérité partagée** entre le daemon et le serveur MCP.

```json
{
  "changes": [
    {
      "type": "style",
      "selector": ".card > h2",
      "property": "font-size",
      "oldValue": "16px",
      "newValue": "18px",
      "tag": "H2",
      "url": "http://localhost:5173/dashboard",
      "timestamp": 1711234567890,
      "applied": false
    }
  ]
}
```

### Filtrage du bruit

Le parser ignore automatiquement :
- Les sélecteurs internes VisBug (`#vibe-annotations-root`, `vis-bug`, etc.)
- Les variables CSS scopées Vue (`--dc13a441-…`)
- Les classes Vue Router (`router-link-active`, transitions)
- Les mutations `node-added` / `node-removed` (rendu Vue)
- Les textes initiaux longs (dump de rendu initial)
- Les attributs `contenteditable` (usage interne VisBug)

---

## Commandes utiles

```bash
# Statut du daemon
pm2 status visbug-ws

# Logs en temps réel
pm2 logs visbug-ws

# Redémarrer le daemon
pm2 restart visbug-ws

# Développement avec rechargement automatique
npm run daemon:watch

# Vider le store manuellement
echo '{"changes":[]}' > ~/.visbug-mcp/changes.json
```

---

## Structure du projet

```
visbug-mcp/
├── src/
│   ├── ws-daemon.js      # Serveur WebSocket autonome (pm2)
│   ├── server.js         # Serveur MCP stdio (Claude Code)
│   └── parser.js         # Parsing, déduplication, formatage
├── extension/
│   ├── manifest.json     # Manifest Chrome v3
│   ├── content-script.js # Observateur DOM + client WebSocket
│   ├── popup.html        # Interface popup Chrome
│   ├── popup.js          # Logique popup
│   └── background.js     # Service worker (minimal)
└── .claude/
    └── commands/
        └── visbug.md     # Skill Claude Code /visbug
```