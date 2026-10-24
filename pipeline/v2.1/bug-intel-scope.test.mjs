import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPath, hasLogic, parseGitmodules, submoduleToegestaan, rankScore, planChunks, MAX_BYTES } from './bug-intel-scope.mjs'

test('eigen code telt mee', () => {
  assert.deepEqual(classifyPath('src/Vault.sol', 5000), { inScope: true })
  assert.deepEqual(classifyPath('contracts/core/Pool.sol', 5000), { inScope: true })
  assert.deepEqual(classifyPath('src/lib/MathLib.sol', 5000), { inScope: true }) // lib dieper in de boom is eigen code
})

test('tests, mocks, scripts, interfaces en afhankelijkheden vallen af, met reden', () => {
  assert.equal(classifyPath('test/Vault.t.sol', 5000).reason, 'tests')
  assert.equal(classifyPath('src/Vault.t.sol', 5000).reason, 'tests')
  assert.equal(classifyPath('script/Deploy.s.sol', 5000).reason, 'scripts')
  assert.equal(classifyPath('contracts/mocks/MockToken.sol', 5000).reason, 'mocks')
  assert.equal(classifyPath('contracts/MockOracle.sol', 5000).reason, 'mocks')
  assert.equal(classifyPath('contracts/interfaces/IVault.sol', 5000).reason, 'interfaces')
  assert.equal(classifyPath('contracts/IVault.sol', 5000).reason, 'interfaces')
  assert.equal(classifyPath('lib/forge-std/src/Test.sol', 5000).reason, 'vendor')
  assert.equal(classifyPath('node_modules/@x/y.sol', 5000).reason, 'vendor')
  assert.equal(classifyPath('src/openzeppelin-contracts/Ownable.sol', 5000).reason, 'vendor')
})

test('hoofdletters in mapnamen maken niets uit, Windows-paden ook niet', () => {
  assert.equal(classifyPath('Test/Vault.sol', 5000).reason, 'tests')
  assert.equal(classifyPath('src\\Mocks\\A.sol', 5000).reason, 'mocks')
})

test('te klein, te groot en geen Solidity', () => {
  assert.equal(classifyPath('src/A.sol', 50).reason, 'tooSmall')
  assert.equal(classifyPath('src/A.sol', MAX_BYTES + 1).reason, 'tooLarge')
  assert.equal(classifyPath('src/A.ts', 5000).reason, 'notSolidity')
  assert.equal(classifyPath('', 5000).reason, 'notSolidity')
})

test('hasLogic: interface-only bestand heeft geen logica, commentaar telt niet mee', () => {
  assert.equal(hasLogic('interface IA { function f() external; }'), false)
  assert.equal(hasLogic('// contract Fake {}\n/* library X {} */\ninterface I {}'), false)
  assert.equal(hasLogic('abstract contract A { }'), true)
  assert.equal(hasLogic('library L { }'), true)
})

test('parseGitmodules leest meerdere submodules', () => {
  const t = '[submodule "lib/forge-std"]\n\tpath = lib/forge-std\n\turl = https://github.com/foundry-rs/forge-std\n[submodule "core"]\n\tpath = packages/core\n\turl = https://github.com/acme/core.git\n'
  const r = parseGitmodules(t)
  assert.equal(r.length, 2)
  assert.deepEqual(r[1], { name: 'core', path: 'packages/core', url: 'https://github.com/acme/core.git' })
})

test('submodules: alleen https naar github, veilig pad, geen afhankelijkheden', () => {
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'https://github.com/acme/core.git' }).ok, true)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'https://github.com/acme/core' }).ok, true)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'git@github.com:acme/core.git' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'file:///etc' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'ext::sh -c id' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'http://github.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'https://evil.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'packages/core', url: 'https://github.com.evil.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: '../escape', url: 'https://github.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: '/abs', url: 'https://github.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: '-flag', url: 'https://github.com/acme/core' }).ok, false)
  assert.equal(submoduleToegestaan({ path: 'lib/forge-std', url: 'https://github.com/foundry-rs/forge-std' }).reason, 'afhankelijkheid')
  assert.equal(submoduleToegestaan({ path: 'a/node_modules/b', url: 'https://github.com/acme/core' }).reason, 'afhankelijkheid')
})

test('rankScore: geld bewegen en orakels gaan vooraan', () => {
  const kluis = 'contract Vault { function withdraw() external { (bool ok,) = msg.sender.call{value: 1}(""); } function price() external { latestRoundData(); } }'
  const kaal = 'contract Constants { uint256 constant A = 1; }'
  assert.ok(rankScore('src/Vault.sol', kluis) > rankScore('src/Constants.sol', kaal))
})

test('planChunks: past in de grenzen, snijdt grote bestanden, meldt wat overblijft', () => {
  const groot = { rel: 'src/Big.sol', text: Array.from({ length: 4000 }, (_, i) => `line ${i} xxxxxxxxxxxxxxxxxxxx`).join('\n'), score: 9 }
  const klein = (n, s) => ({ rel: `src/S${n}.sol`, text: 'contract S {}\n'.repeat(500), score: s })
  const { chunks, notAnalysed } = planChunks([klein(1, 1), groot, klein(2, 2)], { chunkChars: 20_000, maxChunks: 3 })
  assert.ok(chunks.length <= 3)
  for (const c of chunks) assert.ok(c.chars <= 20_000)
  assert.ok(chunks[0].parts[0].rel === 'src/Big.sol', 'hoogste score eerst')
  assert.ok(notAnalysed.length > 0, 'bij een cap van 3 stukken blijft er iets over')
  const allesBytes = groot.text.length + klein(1, 1).text.length + klein(2, 2).text.length
  const gedekt = chunks.flatMap(c => c.parts).reduce((a, p) => a + p.text.length, 0)
  const rest = notAnalysed.reduce((a, p) => a + p.text.length, 0)
  assert.ok(gedekt + rest >= allesBytes - 10, 'niets raakt kwijt: elk deel zit in een stuk of in de restlijst')
})

test('planChunks: leeg en één klein bestand', () => {
  assert.deepEqual(planChunks([]), { chunks: [], notAnalysed: [] })
  const r = planChunks([{ rel: 'a.sol', text: 'contract A {}', score: 1 }])
  assert.equal(r.chunks.length, 1)
  assert.equal(r.notAnalysed.length, 0)
})

test('planChunks: één gigantische regel wordt doorgesneden en past in de grens', () => {
  const r = planChunks([{ rel: 'min.sol', text: 'a'.repeat(70_000), score: 1 }], { chunkChars: 20_000, maxChunks: 10 })
  for (const c of r.chunks) assert.ok(c.chars <= 20_000)
  assert.equal(r.chunks.flatMap(c => c.parts).reduce((a, p) => a + p.text.length, 0), 70_000)
})
