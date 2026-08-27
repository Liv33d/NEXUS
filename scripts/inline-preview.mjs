import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('dist-preview')
const assetsDirectory = resolve(outputDirectory, 'assets')
const files = await readdir(assetsDirectory)
const javascriptFile = files.find((file) => file.endsWith('.js'))
const cssFile = files.find((file) => file.endsWith('.css'))

if (!javascriptFile || !cssFile) throw new Error('Expected one JavaScript and one CSS bundle')

const [html, javascript, css] = await Promise.all([
  readFile(resolve(outputDirectory, 'index.html'), 'utf8'),
  readFile(resolve(assetsDirectory, javascriptFile), 'utf8'),
  readFile(resolve(assetsDirectory, cssFile), 'utf8'),
])

const inlinedJavascript = javascript
  .replaceAll('</script>', '<\\/script>')
const preview = html
  .replace(/<link rel="stylesheet"[^>]+>/, () => `<style>${css}</style>`)
  .replace(/<script type="module"[^>]+><\/script>/, () => `<script type="module">${inlinedJavascript}</script>`)
  .replace(/<link rel="icon"[^>]+>/, '')
  .replace(/<link rel="apple-touch-icon"[^>]+>/, '')

await writeFile(resolve(outputDirectory, 'nexus-phone-preview.html'), preview)
