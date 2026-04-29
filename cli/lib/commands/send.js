const readline = require('readline')

const { parse } = require('../args')
const { fetchCredentials, applyNatsHostOverride } = require('../credentials')
const { load } = require('../transports')

function usage() {
  console.error('usage: exp-orchestrator send <deploy_id> [--mode nats|relay] [--host URL] [--nats-host HOST]')
}

async function run(argv) {
  let args
  try { args = parse(argv) } catch (e) { console.error(e.message); usage(); process.exit(2) }
  if (args.help || args.positional.length !== 1) { usage(); process.exit(args.help ? 0 : 2) }
  const deployId = args.positional[0]

  const transport = load(args.mode)
  console.log(`Mode: ${args.mode}`)

  const cred = await fetchCredentials(args.host, deployId, 'sender')
  const natsBlock = applyNatsHostOverride(cred, args.natsHost)

  let handle
  try {
    handle = await transport.connect({
      host: args.host,
      deployId,
      role: 'sender',
      credentials: cred.credentials,
      natsBlock,
    })
  } catch (e) {
    console.error(`Connect failed (${args.mode}): ${e.message}`)
    if (args.mode === 'nats') console.error('Try --mode relay as a fallback.')
    process.exit(1)
  }

  console.log(`Sender connected (deployment: ${deployId})`)
  console.log('Type messages to send (Ctrl+C to quit):\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.setPrompt('> ')
  rl.prompt()
  rl.on('line', async (line) => {
    if (line) {
      try {
        await transport.send(handle, line)
        console.log(`  sent: ${line}`)
      } catch (e) {
        console.error(`  send error: ${e.message}`)
      }
    }
    rl.prompt()
  })
  rl.on('close', async () => {
    await transport.close(handle).catch(() => {})
    console.log('\nDone.')
    process.exit(0)
  })
}

module.exports = { run }
