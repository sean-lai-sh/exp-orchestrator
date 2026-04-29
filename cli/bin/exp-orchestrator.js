#!/usr/bin/env node
/**
 * exp-orchestrator CLI
 *
 * Subcommands:
 *   send    <deploy_id>   interactive sender REPL
 *   receive <deploy_id>   subscribe and print incoming messages
 *   status  [deploy_id]   list active deployments, or show one
 *   delete  <deploy_id>   tear down a deployment
 *
 * Common flags:
 *   --host <url>          orchestrator backend URL  (default http://localhost:8000)
 *   --mode <nats|relay>   transport               (default nats)
 *   --nats-host <host>    override NATS host     (default value from credentials response)
 */

const COMMANDS = {
  send:    () => require('../lib/commands/send'),
  receive: () => require('../lib/commands/receive'),
  status:  () => require('../lib/commands/status'),
  delete:  () => require('../lib/commands/delete'),
}

function printUsage() {
  console.log(`usage: exp-orchestrator <command> [args]

Commands:
  send    <deploy_id>     interactive sender REPL
  receive <deploy_id>     subscribe and print incoming messages
  status  [deploy_id]     list deployments, or show one
  delete  <deploy_id>     tear down a deployment

Common flags:
  --host <url>            backend URL (default http://localhost:8000)
  --mode <nats|relay>     transport   (default nats)
  --nats-host <host>      override NATS host`)
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  if (!cmd || cmd === '-h' || cmd === '--help') {
    printUsage()
    process.exit(cmd ? 0 : 2)
  }
  const loader = COMMANDS[cmd]
  if (!loader) {
    console.error(`unknown command: ${cmd}`)
    printUsage()
    process.exit(2)
  }
  await loader().run(rest)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
