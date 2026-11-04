import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controleerBereiken } from './ranges-check.mjs'

const MET_BEREIK = `
| Folder | Voided answers | Unknown id | Unreadable |
|---|---|---|---|
| 2026-10-24-dev-set | 5 voided answers | 4 | 1 |
| 2026-10-25-v31 | 0 voided answers | 0 | 0 |

### Ranges if the voided answers are counted

Some text naming 2026-10-24-dev-set and its range.

## Open checks
`

test('een map met weggegooide antwoorden en een bereik in de index is in orde, een map zonder weggegooide antwoorden wordt overgeslagen', () => {
  const r = controleerBereiken(MET_BEREIK)
  assert.deepEqual(r, [{ map: '2026-10-24-dev-set', n: 5, bereikAanwezig: true }])
})

test('geplante fout: haal de map weg onder "Ranges" en de controleur moet dat zien (anders is hij blind)', () => {
  const kapot = MET_BEREIK.replace('Some text naming 2026-10-24-dev-set and its range.', 'Some text that does not name the folder.')
  const r = controleerBereiken(kapot)
  assert.equal(r[0].bereikAanwezig, false)
})

test('geplante fout: de hele "Ranges"-sectie ontbreekt', () => {
  const kapot = MET_BEREIK.split('### Ranges if the voided answers are counted')[0] + '## Open checks\n'
  const r = controleerBereiken(kapot)
  assert.equal(r[0].bereikAanwezig, false)
})

test('een map met nul weggegooide antwoorden heeft geen bereik nodig', () => {
  const r = controleerBereiken(MET_BEREIK)
  assert.equal(r.some((x) => x.map === '2026-10-25-v31'), false)
})
