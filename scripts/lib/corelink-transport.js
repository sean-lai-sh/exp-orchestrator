/**
 * Corelink transport — wraps the vendored corelink.lib.js client.
 *
 * This file is the ONLY place in scripts/ that imports the corelink client.
 * Deleting this file (and removing the require() ternary in sender.js/receiver.js,
 * and the lib/vendor/ directory) is the rip-out path.
 */

// corelink-server uses a self-signed TLS cert in dev. Mirrors the Python
// corelink_admin client, which uses verify=False on httpx.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const corelink = require('./vendor/corelink.lib.js')

async function connect({ host, deployId, role, credentials, corelinkBlock }) {
  if (!corelinkBlock) {
    throw new Error('corelink block missing from credentials response')
  }
  await corelink.connect(
    { username: corelinkBlock.username, password: corelinkBlock.password },
    { ControlIP: corelinkBlock.host, ControlPort: corelinkBlock.port },
  )

  const streamTypes = Object.keys(credentials || {})
  if (streamTypes.length === 0) {
    throw new Error(`no ${role} credentials found in deployment ${deployId}`)
  }
  const streamType = streamTypes[0]
  const cred = credentials[streamType]

  if (role === 'sender') {
    const sendId = await corelink.createSender({
      workspace: cred.workspace,
      protocol: 'ws',
      type: cred.data_type,
    })
    return { role, sendId, cred, streamType }
  }
  // receiver
  return { role, cred, streamType }
}

async function send(handle, message) {
  if (handle.role !== 'sender') throw new Error('send() called on non-sender handle')
  await corelink.send(handle.sendId, Buffer.from(message, 'utf-8'))
}

async function subscribe(handle, onMessage) {
  if (handle.role !== 'receiver') throw new Error('subscribe() called on non-receiver handle')
  // Dedupe explicit subscribe() calls — the JS lib's createReceiver does NOT
  // auto-subscribe (no `subscribe` field in its request), so we DO need to
  // call subscribe() ourselves for each stream. But on('receiver') alerts
  // can re-fire for senders we already see, and we want at most one
  // subscription per sender so the corelink-server delivers each message
  // exactly once.
  const subscribed = new Set()
  const safeSubscribe = async (sid) => {
    if (sid == null || subscribed.has(sid)) return
    subscribed.add(sid)
    await corelink.subscribe({ streamIDs: [sid] })
  }
  corelink.on('receiver', async (data) => { await safeSubscribe(data.streamID) })
  corelink.on('data', (streamID, data) => {
    onMessage(data.toString('utf-8'))
  })
  const streamList = await corelink.createReceiver({
    workspace: handle.cred.workspace,
    streamIDs: [],
    type: handle.cred.data_type,
    protocol: 'ws',
    alert: true,
  })
  for (const item of streamList || []) {
    await safeSubscribe(item && item.streamID)
  }
  return async () => { await corelink.exit() }
}

async function close(handle) {
  await corelink.exit()
}

module.exports = { connect, send, subscribe, close }
