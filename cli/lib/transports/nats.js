/**
 * NATS transport — wraps the official `nats` npm client.
 */

const { connect: natsConnect, StringCodec } = require('nats')

const _sc = StringCodec()

function _withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`nats ${what} timed out after ${ms / 1000}s`)),
        ms,
      ),
    ),
  ])
}

function _normalizeCreds(credentials) {
  // The /credentials endpoint now returns a list of {peer_id, stream_id, data_type, ...}
  // for each edge. Old shape (dict keyed by stream_type) is also accepted so older
  // backends keep working.
  if (Array.isArray(credentials)) return credentials
  if (credentials && typeof credentials === 'object') {
    return Object.entries(credentials).map(([data_type, cred]) => ({ data_type, ...cred }))
  }
  return []
}

async function connect({ deployId, role, credentials, natsBlock }) {
  if (!natsBlock) {
    throw new Error('nats block missing from credentials response')
  }
  const url = natsBlock.url || `nats://${natsBlock.host}:${natsBlock.port}`

  const nc = await _withTimeout(
    natsConnect({
      servers: url,
      token: natsBlock.token || undefined,
      reconnect: false,
      timeout: 5_000,
    }),
    10_000,
    'connect',
  )

  const creds = _normalizeCreds(credentials)
  if (creds.length === 0) {
    throw new Error(`no ${role} credentials found in deployment ${deployId}`)
  }

  return { role, nc, creds }
}

async function send(handle, message) {
  if (handle.role !== 'sender') throw new Error('send() called on non-sender handle')
  // Fan out to every outbound edge.
  const data = _sc.encode(message)
  for (const cred of handle.creds) {
    handle.nc.publish(cred.stream_id, data)
  }
  await handle.nc.flush()
}

async function subscribe(handle, onMessage) {
  if (handle.role !== 'receiver') throw new Error('subscribe() called on non-receiver handle')
  // Fan in: subscribe to every inbound edge.
  const subs = handle.creds.map((cred) => handle.nc.subscribe(cred.stream_id))
  for (const sub of subs) {
    ;(async () => {
      for await (const msg of sub) {
        onMessage(_sc.decode(msg.data))
      }
    })().catch((e) => { console.error(`[nats] subscriber error: ${e.message}`) })
  }
  return async () => { await Promise.all(subs.map((s) => s.drain())) }
}

async function close(handle) {
  try {
    await handle.nc.drain()
  } catch {
    // intentionally ignored — tearing down anyway
  }
}

module.exports = { connect, send, subscribe, close }
