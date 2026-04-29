const test = require('node:test')
const assert = require('node:assert/strict')

test('nats and relay transports expose the same interface', () => {
  const nats = require('../transports/nats')
  const relay = require('../transports/relay')
  for (const fn of ['connect', 'send', 'subscribe', 'close']) {
    assert.equal(typeof nats[fn], 'function', `nats transport missing ${fn}`)
    assert.equal(typeof relay[fn], 'function', `relay transport missing ${fn}`)
  }
})

test('transport loader rejects unknown modes', () => {
  const { load } = require('../transports')
  assert.throws(() => load('imaginary'), /unknown mode/)
})

test('args parser rejects unknown flags', () => {
  const { parse } = require('../args')
  assert.throws(() => parse(['--unknown']), /unknown flag/)
})

test('args parser keeps positional + nats-host override', () => {
  const { parse } = require('../args')
  const a = parse(['abc123', '--nats-host', '127.0.0.1'])
  assert.equal(a.positional[0], 'abc123')
  assert.equal(a.natsHost, '127.0.0.1')
  assert.equal(a.mode, 'nats')
})

test('credentials.applyNatsHostOverride preserves port when overriding host', () => {
  const { applyNatsHostOverride } = require('../credentials')
  const cred = { nats: { host: 'host.docker.internal', port: 4222, token: 't' } }
  const out = applyNatsHostOverride(cred, '127.0.0.1')
  assert.equal(out.host, '127.0.0.1')
  assert.equal(out.port, 4222)
  assert.equal(out.url, 'nats://127.0.0.1:4222')
})

test('relay transport send POSTs to backend with the message', async () => {
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
  }
  const t = require('../transports/relay')
  const handle = await t.connect({
    host: 'http://localhost:8000',
    deployId: 'abc',
    role: 'sender',
    _fetch: fakeFetch,
  })
  await t.send(handle, 'hello')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://localhost:8000/deployments/abc/messages')
  assert.deepEqual(JSON.parse(calls[0].opts.body), { data: 'hello' })
})
