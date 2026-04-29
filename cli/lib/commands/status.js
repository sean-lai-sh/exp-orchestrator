const { parse } = require('../args')

function usage() {
  console.error('usage: exp-orchestrator status [deploy_id] [--host URL]')
}

async function run(argv) {
  let args
  try { args = parse(argv, { allowPositional: 1 }) } catch (e) { console.error(e.message); usage(); process.exit(2) }
  if (args.help) { usage(); process.exit(0) }

  if (args.positional.length === 0) {
    const resp = await fetch(`${args.host}/deployments`)
    if (!resp.ok) { console.error(`status failed: ${resp.status} ${await resp.text()}`); process.exit(1) }
    const body = await resp.json()
    const ids = Object.keys(body)
    if (ids.length === 0) { console.log('(no active deployments)'); return }
    for (const id of ids) {
      const d = body[id]
      console.log(`${id}  nodes=${d.node_count} edges=${d.edge_count} plugins=[${d.queued_plugins.join(', ')}]`)
    }
    return
  }

  const deployId = args.positional[0]
  for (const role of ['sender', 'receiver']) {
    const resp = await fetch(`${args.host}/deployments/${deployId}/credentials?role=${role}`)
    if (!resp.ok) {
      console.error(`status failed for ${role}: ${resp.status} ${await resp.text()}`)
      process.exit(1)
    }
    console.log(`--- ${role} ---`)
    console.log(JSON.stringify(await resp.json(), null, 2))
  }
}

module.exports = { run }
