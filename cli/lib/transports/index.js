function load(mode) {
  if (mode === 'nats') return require('./nats')
  if (mode === 'relay') return require('./relay')
  throw new Error(`unknown mode: ${mode} (expected nats or relay)`)
}

module.exports = { load }
