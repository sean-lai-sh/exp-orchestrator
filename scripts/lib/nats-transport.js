/**
 * NATS transport — wraps the official `nats` npm client.
 *
 * Each handle wraps a NATS connection plus the per-role credential block
 * (subject + workspace) returned by the orchestrator's credentials endpoint.
 *
 * - sender: resolves a subject from credentials.<type>.stream_id and publishes UTF-8
 * - receiver: subscribes to credentials.<type>.stream_id and forwards each msg
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

async function connect({ host, deployId, role, credentials, natsBlock }) {
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

  const streamTypes = Object.keys(credentials || {})
  if (streamTypes.length === 0) {
    throw new Error(`no ${role} credentials found in deployment ${deployId}`)
  }
  const streamType = streamTypes[0]
  const cred = credentials[streamType]

  return { role, nc, cred, streamType }
}

async function send(handle, message) {
  if (handle.role !== 'sender') throw new Error('send() called on non-sender handle')
  handle.nc.publish(handle.cred.stream_id, _sc.encode(message))
  await handle.nc.flush()
}

async function subscribe(handle, onMessage) {
  if (handle.role !== 'receiver') throw new Error('subscribe() called on non-receiver handle')
  const sub = handle.nc.subscribe(handle.cred.stream_id)
  ;(async () => {
    for await (const msg of sub) {
      onMessage(_sc.decode(msg.data))
    }
  })().catch((e) => { console.error(`[nats] subscriber error: ${e.message}`) })
  return async () => { await sub.drain() }
}

async function close(handle) {
  try {
    await handle.nc.drain()
  } catch {
    // intentionally ignored — tearing down anyway
  }
}

module.exports = { connect, send, subscribe, close }
