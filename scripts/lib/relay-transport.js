/**
 * Relay transport — sends/subscribes via the orchestrator backend's HTTP/SSE
 * endpoints. Pure HTTP; useful as a fallback when the broker is unreachable.
 */

const httpStream = require('http')
const httpsStream = require('https')

async function connect({ host, deployId, role, credentials, _fetch = globalThis.fetch }) {
  return { host, deployId, role, _fetch }
}

async function send(handle, message) {
  const url = `${handle.host}/deployments/${handle.deployId}/messages`
  const resp = await handle._fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: message }),
  })
  if (!resp.ok) {
    throw new Error(`relay POST failed: ${resp.status}`)
  }
  return resp.json()
}

async function subscribe(handle, onMessage) {
  // Stream Server-Sent Events from /deployments/{id}/messages.
  const url = new URL(`${handle.host}/deployments/${handle.deployId}/messages`)
  const isHttps = url.protocol === 'https:'
  const lib = isHttps ? httpsStream : httpStream
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`relay subscribe failed: ${res.statusCode}`))
        return
      }
      let buffer = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString('utf-8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.message != null) onMessage(payload.message)
            } catch { /* ignore malformed line */ }
          }
        }
      })
      res.on('end', () => resolve(() => req.destroy()))
      res.on('error', reject)
    })
    req.on('error', reject)
    // Resolve immediately with an unsubscribe — caller blocks elsewhere
    setImmediate(() => resolve(() => req.destroy()))
  })
}

async function close(handle) { /* nothing to close on relay side */ }

module.exports = { connect, send, subscribe, close }
