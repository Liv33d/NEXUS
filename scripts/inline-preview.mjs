import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('dist-preview')
const assetsDirectory = resolve(outputDirectory, 'assets')
const files = await readdir(assetsDirectory)
const javascriptFile = files.find((file) => file.endsWith('.js'))
const cssFile = files.find((file) => file.endsWith('.css'))

if (!javascriptFile || !cssFile) throw new Error('Expected one JavaScript and one CSS bundle')

const [html, javascript, css, earthTexture, earthTopology, nightSky] = await Promise.all([
  readFile(resolve(outputDirectory, 'index.html'), 'utf8'),
  readFile(resolve(assetsDirectory, javascriptFile), 'utf8'),
  readFile(resolve(assetsDirectory, cssFile), 'utf8'),
  readFile(resolve('public/earth-blue-marble.jpg')),
  readFile(resolve('public/earth-topology.png')),
  readFile(resolve('public/night-sky.png')),
])

const earthDataUrl = `data:image/jpeg;base64,${earthTexture.toString('base64')}`
const topologyDataUrl = `data:image/png;base64,${earthTopology.toString('base64')}`
const nightSkyDataUrl = `data:image/png;base64,${nightSky.toString('base64')}`
const inlinedJavascript = javascript
  .replaceAll('./earth-blue-marble.jpg', earthDataUrl)
  .replaceAll('./earth-topology.png', topologyDataUrl)
  .replaceAll('./night-sky.png', nightSkyDataUrl)
  .replaceAll('</script>', '<\\/script>')
const preview = html
  .replace(/<link rel="stylesheet"[^>]+>/, () => `<style>${css}</style>`)
  .replace(/<script type="module"[^>]+><\/script>/, () => `<script type="module">${inlinedJavascript}</script>`)
  .replace(/<link rel="icon"[^>]+>/, '')
  .replace(/<link rel="apple-touch-icon"[^>]+>/, '')

await writeFile(resolve(outputDirectory, 'nexus-phone-preview.html'), preview)
