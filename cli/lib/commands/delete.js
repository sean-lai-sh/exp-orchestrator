const { parse } = require('../args')

function usage() {
  console.error('usage: exp-orchestrator delete <deploy_id> [--host URL]')
}

async function run(argv) {
  let args
  try { args = parse(argv) } catch (e) { console.error(e.message); usage(); process.exit(2) }
  if (args.help || args.positional.length !== 1) { usage(); process.exit(args.help ? 0 : 2) }
  const deployId = args.positional[0]

  const resp = await fetch(`${args.host}/deployments/${deployId}`, { method: 'DELETE' })
  const body = await resp.text()
  if (!resp.ok) {
    console.error(`delete failed: ${resp.status} ${body}`)
    process.exit(1)
  }
  console.log(body)
}

module.exports = { run }
