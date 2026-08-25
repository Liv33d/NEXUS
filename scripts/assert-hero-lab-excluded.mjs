import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve(process.cwd(), 'dist')
if (!existsSync(dist)) throw new Error('dist does not exist; build the production app before checking lab exclusion')

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const emitted = files(dist)
const leaked = emitted.filter((path) => path.endsWith('hero-lab.html') || (/\.(?:js|html)$/.test(path) && /FIXTURE LAB · NOT LIVE|HeroCardLab/.test(readFileSync(path, 'utf8'))))
if (leaked.length) throw new Error(`Development Hero Card Lab leaked into production: ${leaked.join(', ')}`)
console.log('Hero Card Lab is excluded from the production build.')
