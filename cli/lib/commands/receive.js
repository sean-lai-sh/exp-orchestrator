const { parse } = require('../args')
const { fetchCredentials, applyNatsHostOverride } = require('../credentials')
const { load } = require('../transports')

function usage() {
  console.error('usage: exp-orchestrator receive <deploy_id> [--mode nats|relay] [--host URL] [--nats-host HOST]')
}

async function run(argv) {
  let args
  try { args = parse(argv) } catch (e) { console.error(e.message); usage(); process.exit(2) }
  if (args.help || args.positional.length !== 1) { usage(); process.exit(args.help ? 0 : 2) }
  const deployId = args.positional[0]

  const transport = load(args.mode)
  console.log(`Mode: ${args.mode}`)

  const cred = await fetchCredentials(args.host, deployId, 'receiver')
  const natsBlock = applyNatsHostOverride(cred, args.natsHost)

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId,
      role: 'receiver',
      credentials: cred.credentials,
      natsBlock,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'nats') console.error('Try --mode relay as a fallback.')
    process.exit(1)
  }

  console.log(`Subscribing to deployment: ${deployId} ...`)

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

module.exports = { run }
