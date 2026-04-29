const test = require('node:test')
const assert = require('node:assert/strict')

test('nats-transport exports the same shape as relay-transport', () => {
  const natsT = require('../nats-transport')
  const relay = require('../relay-transport')
  for (const fn of ['connect', 'send', 'subscribe', 'close']) {
    assert.equal(typeof natsT[fn], 'function', `nats-transport missing ${fn}`)
    assert.equal(typeof relay[fn], 'function', `relay-transport missing ${fn}`)
  }
})
