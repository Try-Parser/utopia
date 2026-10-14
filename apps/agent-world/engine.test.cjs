/* Run with Node's built-in test runner, in Docker. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');

test('assigned missions queue, traverse independent checks, and complete sequentially', () => {
  const s = E.fresh(); E.assign(s, 'First feature'); E.assign(s, 'Second feature');
  E.tick(s, 5); assert.equal(s.missions[0].status, 'active'); assert.equal(s.missions[1].status, 'queued');
  for (let i = 0; i < 4; i++) E.tick(s, 5);
  assert.deepEqual(E.stage(s.missions[0]).roles, ['reviewer', 'qa', 'security']);
  for (let i = 0; i < 3; i++) E.tick(s, 5);
  assert.equal(s.missions[0].status, 'complete'); assert.equal(s.missions[0].elapsed, E.TOTAL);
  E.tick(s, 1); assert.equal(s.missions[1].status, 'active');
});
test('pause and speed control simulated time without running real work', () => {
  const s = E.fresh(); E.assign(s, 'A mission'); s.paused = true; E.tick(s, 5); assert.equal(s.elapsed, 0);
  s.paused = false; s.speed = 4; E.tick(s, 5); assert.equal(s.missions[0].elapsed, 20);
});
test('restores legitimate sessions and rejects corrupt, inconsistent or excessive saved state', () => {
  const s = E.fresh(); E.assign(s, '<img src=x onerror=alert(1)>'); E.tick(s, 2);
  assert.deepEqual(E.restore(JSON.stringify(s)), s);
  for (const raw of ['not json', '{}', JSON.stringify({...s, speed: 8}), JSON.stringify({...s, missions: [{...s.missions[0], status:'complete'}]}), 'x'.repeat(100001)]) assert.deepEqual(E.restore(raw), E.fresh());
  const duplicate = {...s, missions:[s.missions[0], s.missions[0]]}; assert.deepEqual(E.restore(JSON.stringify(duplicate)), E.fresh());
});
test('rejects invalid mission input and bounded board overflow', () => {
  const s = E.fresh(); for (const name of ['', ' ', 'x'.repeat(101), null]) assert.throws(() => E.assign(s,name));
  assert.throws(() => E.assign(s,'Valid','x'.repeat(601))); assert.throws(() => E.assign(s,'Valid','','unknown'));
  for (let i=0;i<50;i++) E.assign(s,`Mission ${i}`); assert.throws(() => E.assign(s,'Overflow'));
});
