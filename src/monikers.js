import crypto from "node:crypto"

export const ADJECTIVES = [
  "Zydeco",
  "Bayou",
  "Pepper",
  "Cypress",
  "Vermilion",
  "Acadian",
  "Magnolia",
  "Parish",
  "Gulf",
  "Prairie",
  "Delta",
  "Marsh",
  "Pelican",
  "Creole",
  "Chenier",
  "Cane",
  "Moss",
  "Heron",
  "Paprika",
  "Cayenne",
  "Levee",
  "Azalea",
  "Liveoak",
  "Pirogue",
]

export const NOUNS = [
  "Scout",
  "Pilot",
  "Rover",
  "Ranger",
  "Cadet",
  "Navigator",
  "Spark",
  "Orbit",
  "Lander",
  "Signal",
  "Circuit",
  "Beacon",
  "Vector",
  "Pioneer",
  "Compass",
  "Relay",
  "Scholar",
  "Builder",
  "Maker",
  "Guide",
  "Quest",
  "Harbor",
  "Courier",
  "Atlas",
]

export function pickMoniker(taken) {
  const pairs = []
  for (const adjective of ADJECTIVES) {
    for (const noun of NOUNS) pairs.push(`${adjective} ${noun}`)
  }
  const start = crypto.randomInt(pairs.length)
  for (let i = 0; i < pairs.length; i++) {
    const name = pairs[(start + i) % pairs.length]
    if (!taken.has(name)) return name
  }
  const base = pairs[start]
  for (let n = 2; n < 100000; n++) {
    const name = `${base} ${n}`
    if (!taken.has(name)) return name
  }
  throw new Error("No monikers left")
}
