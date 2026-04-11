import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..')
const assetsDir = path.join(appDir, 'assets')
const generatedStoreDir = path.join(appDir, 'store-assets', 'generated')

const paths = {
  iconSource: path.join(assetsDir, 'icon-source.svg'),
  adaptiveSource: path.join(assetsDir, 'adaptive-icon-source.svg'),
  icon: path.join(assetsDir, 'icon.png'),
  adaptiveIcon: path.join(assetsDir, 'adaptive-icon.png'),
  favicon: path.join(assetsDir, 'favicon.png'),
  appleStoreIcon: path.join(generatedStoreDir, 'apple', 'app-store-icon-1024.png'),
  googleStoreIcon: path.join(generatedStoreDir, 'google', 'play-icon-512.png')
}

const BRAND = {
  primary: '#f43b57',
  primaryEmphasis: '#d92c47',
  primaryAccent: '#ff7a8e',
  primarySoft: '#fff1f4',
  text: '#211820',
  gold: '#ffd166',
  goldDeep: '#ffbf3c',
  mark: '#fffafc'
}

function polar(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  }
}

function formatPoint(point) {
  return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`
}

function createWebMarkup({
  size,
  centerX,
  centerY,
  ringRadii,
  tipRadius,
  spokeCount,
  lineColor
}) {
  const angles = Array.from({ length: spokeCount }, (_, index) => (360 / spokeCount) * index)
  const arcPaths = []
  const spokePaths = []

  for (const angle of angles) {
    const inner = polar(centerX, centerY, 40, angle)
    const outer = polar(centerX, centerY, tipRadius, angle)
    spokePaths.push(`<path d="M ${formatPoint(inner)} L ${formatPoint(outer)}" />`)
  }

  for (const radius of ringRadii) {
    for (let index = 0; index < angles.length; index += 1) {
      const startAngle = angles[index]
      const endAngle = angles[(index + 1) % angles.length]
      const midAngle = startAngle + 180 / spokeCount
      const start = polar(centerX, centerY, radius, startAngle)
      const end = polar(centerX, centerY, radius, endAngle)
      const control = polar(centerX, centerY, radius * 1.17, midAngle)
      arcPaths.push(
        `<path d="M ${formatPoint(start)} Q ${formatPoint(control)} ${formatPoint(end)}" />`
      )
    }
  }

  const outerNodes = angles.map((angle) => {
    const point = polar(centerX, centerY, tipRadius, angle)
    return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${(size * 0.009).toFixed(1)}" />`
  })

  return `
    <g
      fill="none"
      stroke="${lineColor}"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.98"
    >
      <g stroke-width="${(size * 0.013).toFixed(1)}">${arcPaths.join('')}</g>
      <g stroke-width="${(size * 0.012).toFixed(1)}">${spokePaths.join('')}</g>
      <g fill="${lineColor}" stroke="none">${outerNodes.join('')}</g>
    </g>
  `
}

function createFullIconSvg() {
  const size = 1024
  const center = size / 2
  const web = createWebMarkup({
    size,
    centerX: center,
    centerY: center,
    ringRadii: [118, 182, 246, 302],
    tipRadius: 342,
    spokeCount: 8,
    lineColor: BRAND.mark
  })
  const webShadow = createWebMarkup({
    size,
    centerX: center,
    centerY: center,
    ringRadii: [118, 182, 246, 302],
    tipRadius: 342,
    spokeCount: 8,
    lineColor: '#961a34'
  })

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${BRAND.primaryAccent}" />
          <stop offset="48%" stop-color="${BRAND.primary}" />
          <stop offset="100%" stop-color="${BRAND.primaryEmphasis}" />
        </linearGradient>
        <radialGradient id="glow" cx="28%" cy="20%" r="72%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34" />
          <stop offset="62%" stop-color="#ffffff" stop-opacity="0.08" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${BRAND.gold}" />
          <stop offset="100%" stop-color="${BRAND.goldDeep}" />
        </linearGradient>
      </defs>

      <rect width="${size}" height="${size}" fill="url(#bg)" />
      <rect width="${size}" height="${size}" fill="url(#glow)" />
      <circle cx="236" cy="208" r="210" fill="#ffffff" opacity="0.12" />
      <circle cx="794" cy="842" r="250" fill="#7e1630" opacity="0.10" />
      <path
        d="M130 318 C272 172 480 130 672 186 C774 216 852 274 916 362"
        fill="none"
        stroke="#ffffff"
        opacity="0.16"
        stroke-width="20"
        stroke-linecap="round"
      />
      <path
        d="M112 702 C224 816 392 880 584 858 C734 840 838 770 914 666"
        fill="none"
        stroke="#ffffff"
        opacity="0.12"
        stroke-width="18"
        stroke-linecap="round"
      />

      <g transform="translate(0 18)" opacity="0.18">${webShadow}</g>
      ${web}

      <circle cx="${center}" cy="${center + 16}" r="44" fill="#8f1b34" opacity="0.18" />
      <circle cx="${center}" cy="${center}" r="44" fill="url(#gold)" />
      <circle cx="${center - 10}" cy="${center - 12}" r="12" fill="#ffffff" opacity="0.42" />
    </svg>
  `.trim()
}

function createAdaptiveIconSvg() {
  const size = 1024
  const center = size / 2
  const web = createWebMarkup({
    size,
    centerX: center,
    centerY: center,
    ringRadii: [120, 188, 254, 320],
    tipRadius: 364,
    spokeCount: 8,
    lineColor: BRAND.mark
  })

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${BRAND.gold}" />
          <stop offset="100%" stop-color="${BRAND.goldDeep}" />
        </linearGradient>
      </defs>
      ${web}
      <circle cx="${center}" cy="${center}" r="48" fill="url(#gold)" />
      <circle cx="${center - 12}" cy="${center - 14}" r="13" fill="#ffffff" opacity="0.4" />
    </svg>
  `.trim()
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function writeText(filePath, contents) {
  await ensureDir(filePath)
  await fs.writeFile(filePath, contents)
}

function runSips(args) {
  execFileSync('sips', args, { stdio: 'ignore' })
}

async function rasterizeSvg(sourcePath, outputPath, size) {
  await ensureDir(outputPath)
  const tempPng = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mereb-icon-')), `${path.basename(outputPath, '.png')}.png`)
  runSips(['-s', 'format', 'png', sourcePath, '--out', tempPng])
  runSips(['-z', String(size), String(size), tempPng, '--out', outputPath])
  await fs.rm(path.dirname(tempPng), { recursive: true, force: true })
}

async function main() {
  await writeText(paths.iconSource, createFullIconSvg())
  await writeText(paths.adaptiveSource, createAdaptiveIconSvg())

  await rasterizeSvg(paths.iconSource, paths.icon, 1024)
  await rasterizeSvg(paths.adaptiveSource, paths.adaptiveIcon, 1024)
  await rasterizeSvg(paths.iconSource, paths.favicon, 256)
  await rasterizeSvg(paths.iconSource, paths.appleStoreIcon, 1024)
  await rasterizeSvg(paths.iconSource, paths.googleStoreIcon, 512)

  console.log('Generated mobile icon assets:')
  console.log(`- ${path.relative(appDir, paths.icon)}`)
  console.log(`- ${path.relative(appDir, paths.adaptiveIcon)}`)
  console.log(`- ${path.relative(appDir, paths.favicon)}`)
  console.log(`- ${path.relative(appDir, paths.appleStoreIcon)}`)
  console.log(`- ${path.relative(appDir, paths.googleStoreIcon)}`)
}

await main()
