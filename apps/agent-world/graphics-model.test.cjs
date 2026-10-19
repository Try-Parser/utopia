const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('versioned graphics contract fixes the four public style identifiers and safe default',()=>{
 const text=fs.readFileSync(path.join(__dirname,'graphics.contract.json'),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),'b1036e8749f97c645f45e380d7be775d5d387c905f6aac283d3b4f3a6feac78b');
 const contract=JSON.parse(text);assert.equal(contract.version,2);assert.equal(contract.default,'polished');assert.equal(contract.storageKey,'agent-world.graphics.v1');
 assert.deepEqual(contract.styles.map(s=>s.id),['illustrated','polished','pixel','low-poly']);assert.deepEqual(contract.styles.map(s=>s.employees),['illustrated','volumetric','illustrated','volumetric']);assert.equal(new Set(contract.styles.map(s=>s.label)).size,4);
});
