#!/usr/bin/env node
/**
 * Standalone receiver that auto-connects via NATS (default) or relay.
 * Usage: node receiver.js <deploy_id> [--mode nats|relay] [--host URL] [--nats-host HOST]
 */

function parseArgs(argv) {
  const args = { mode: 'nats', host: 'http://localhost:8000', natsHost: null }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--mode') args.mode = argv[++i]
    else if (a === '--host') args.host = argv[++i]
    else if (a === '--nats-host') args.natsHost = argv[++i]
    else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2) }
    else positional.push(a)
  }
  if (positional.length !== 1) {
    console.error('usage: receiver.js <deploy_id> [--mode nats|relay] [--host URL] [--nats-host HOST]')
    process.exit(2)
  }
  args.deployId = positional[0]
  return args
}

async function fetchCredentials(host, deployId, role) {
  const url = `${host}/deployments/${deployId}/credentials?role=${role}`
  const resp = await fetch(url)
  if (!resp.ok) {
    console.error(`Error fetching credentials: ${resp.status} ${await resp.text()}`)
    process.exit(1)
  }
  return resp.json()
}

async function main() {
  const args = parseArgs(process.argv)
  const transport = args.mode === 'nats'
    ? require('./lib/nats-transport')
    : require('./lib/relay-transport')

  console.log(`Mode: ${args.mode}`)
  const cred = await fetchCredentials(args.host, args.deployId, 'receiver')

  const natsBlock = cred.nats && args.natsHost
    ? { ...cred.nats, host: args.natsHost, url: `nats://${args.natsHost}:${cred.nats.port}` }
    : cred.nats

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId: args.deployId,
      role: 'receiver',
      credentials: cred.credentials,
      natsBlock,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'nats') console.error('Try --mode relay as a fallback.')
    process.exit(1)
  }

  console.log(`Subscribing to deployment: ${args.deployId} ...`)

  try {
    await transport.subscribe(handle, (msg) => {
      console.log(`[received] ${msg}`)
    })
  } catch (e) {
    console.error(`Subscribe failed (${args.mode}): ${e.message}`)
    process.exit(1)
  }

  console.log('Listening for messages (Ctrl+C to quit)...\n')
  process.on('SIGINT', async () => {
    await transport.close(handle).catch(() => {})
    process.exit(0)
  })
  await new Promise(() => {})
}

main().catch((e) => { console.error(e); process.exit(1) })
