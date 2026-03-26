// popup.js
const ws = new WebSocket('ws://127.0.0.1:4844')
const dot = document.getElementById('dot')
const statusEl = document.getElementById('status')
const count = document.getElementById('count')
const clearBtn = document.getElementById('clear-btn')
const copyBtn = document.getElementById('copy-btn')

let cachedChangesText = ''

ws.onopen = () => {
  dot.className = 'dot on'
  statusEl.textContent = 'Connecté au serveur MCP'
  clearBtn.disabled = false
  copyBtn.disabled = false
  ws.send(JSON.stringify({ event: 'popup-ping' }))
}

ws.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data)
    if (data.event === 'stats') {
      count.textContent = `${data.total} mutation(s) capturée(s)`
      cachedChangesText = data.changesText ?? ''
    }
  } catch {}
}

ws.onerror = ws.onclose = () => {
  dot.className = 'dot off'
  statusEl.textContent = 'Serveur MCP non démarré'
  count.textContent = 'Lance : pm2 start src/ws-daemon.js --name visbug-ws'
  clearBtn.disabled = true
  copyBtn.disabled = true
  cachedChangesText = ''
}

clearBtn.addEventListener('click', () => {
  ws.send(JSON.stringify({ event: 'popup-clear' }))
  count.textContent = '0 mutation(s) capturée(s)'
  cachedChangesText = ''
})

copyBtn.addEventListener('click', () => {
  const text = cachedChangesText || 'Aucun changement.'
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copié !'
    copyBtn.classList.add('copied')
    setTimeout(() => {
      copyBtn.textContent = 'Copier les changements'
      copyBtn.classList.remove('copied')
    }, 2000)
  })
})