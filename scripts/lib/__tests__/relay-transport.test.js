const test = require('node:test')
const assert = require('node:assert/strict')

test('relay-transport exports the expected interface', () => {
  const t = require('../relay-transport')
  assert.equal(typeof t.connect, 'function')
  assert.equal(typeof t.send, 'function')
  assert.equal(typeof t.subscribe, 'function')
  assert.equal(typeof t.close, 'function')
})

test('relay-transport.send POSTs to backend with the message', async () => {
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, status: 200, json: async () => ({ status: 'ok', listeners: 1 }) }
  }
  const t = require('../relay-transport')
  const handle = await t.connect({
    host: 'http://localhost:8000',
    deployId: 'abc',
    role: 'sender',
    credentials: {},
    _fetch: fakeFetch,
  })
  await t.send(handle, 'hello')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://localhost:8000/deployments/abc/messages')
  assert.deepEqual(JSON.parse(calls[0].opts.body), { data: 'hello' })
})
