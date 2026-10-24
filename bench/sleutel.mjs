// Haalt een API-sleutel uit de omgeving, of anders uit het .env-bestand van de server. De sleutel wordt nooit getoond.
import { readFileSync, existsSync } from 'node:fs'
export function haalSleutel(naam, pad = '/app/euler-liquidator/.env') {
  if (process.env[naam]) return process.env[naam]
  if (!existsSync(pad)) return ''
  for (const l of readFileSync(pad, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && m[1] === naam) return m[2].trim()
  }
  return ''
}
