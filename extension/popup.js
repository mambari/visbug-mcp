// popup.js
const ws = new WebSocket('ws://127.0.0.1:4844')
const dot = document.getElementById('dot')
const status = document.getElementById('status')
const count = document.getElementById('count')

ws.onopen = () => {
  dot.className = 'dot on'
  status.textContent = 'Connecté au serveur MCP'
  ws.send(JSON.stringify({ event: 'popup-ping' }))
}

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data)
    if (data.event === 'stats') {
      count.textContent = `${data.total} mutation(s) capturée(s)`
    }
  } catch {}
}

ws.onerror = ws.onclose = () => {
  dot.className = 'dot off'
  status.textContent = 'Serveur MCP non démarré'
  count.textContent = 'Lance : npm install && node src/server.js'
}
