/**
 * Shared argument parser for subcommands.
 *
 * Recognised flags (all optional):
 *   --host       <url>     backend URL          (default http://localhost:8000)
 *   --mode       <name>    transport            (default nats)
 *   --nats-host  <host>    override NATS host
 *
 * Unknown flags are an error. Positional args are returned in order.
 */

function parse(argv, { allowPositional = 1 } = {}) {
  const args = {
    mode: 'nats',
    host: process.env.EXP_HOST || 'http://localhost:8000',
    natsHost: null,
    positional: [],
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--mode') args.mode = argv[++i]
    else if (a === '--host') args.host = argv[++i]
    else if (a === '--nats-host') args.natsHost = argv[++i]
    else if (a === '-h' || a === '--help') args.help = true
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`)
    else args.positional.push(a)
  }
  if (allowPositional !== '*' && args.positional.length > allowPositional) {
    throw new Error(`unexpected positional argument: ${args.positional[allowPositional]}`)
  }
  return args
}

module.exports = { parse }
