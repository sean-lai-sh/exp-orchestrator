#!/usr/bin/env node
/**
 * Standalone receiver that auto-connects via corelink (default) or relay.
 * Usage: node receiver.js <deploy_id> [--mode corelink|relay] [--host URL]
 */

function parseArgs(argv) {
  const args = { mode: 'corelink', host: 'http://localhost:8000', corelinkHost: null }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--mode') args.mode = argv[++i]
    else if (a === '--host') args.host = argv[++i]
    else if (a === '--corelink-host') args.corelinkHost = argv[++i]
    else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2) }
    else positional.push(a)
  }
  if (positional.length !== 1) {
    console.error('usage: receiver.js <deploy_id> [--mode corelink|relay] [--host URL] [--corelink-host HOST]')
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
  const transport = args.mode === 'corelink'
    ? require('./lib/corelink-transport')
    : require('./lib/relay-transport')

  console.log(`Mode: ${args.mode}`)
  const cred = await fetchCredentials(args.host, args.deployId, 'receiver')

  // Allow CLI override of the corelink host (useful when the plugin container
  // and the host process need different hostnames to reach the same server).
  const corelinkBlock = cred.corelink && args.corelinkHost
    ? { ...cred.corelink, host: args.corelinkHost }
    : cred.corelink

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId: args.deployId,
      role: 'receiver',
      credentials: cred.credentials,
      corelinkBlock,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'corelink') console.error('Try --mode relay as a fallback.')
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

  // Keep alive
  process.on('SIGINT', async () => {
    await transport.close(handle).catch(() => {})
    console.log('\nDone.')
    process.exit(0)
  })
  await new Promise(() => {})
}

main().catch((e) => { console.error(e); process.exit(1) })
