import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const bump = process.argv[2]
const prefix = process.argv[3] ?? 'v'
const validBumps = new Set(['patch', 'minor', 'major'])

if (!validBumps.has(bump)) {
  console.error('Usage: node ./scripts/compute-next-tag.mjs <patch|minor|major> [tag-prefix]')
  process.exit(1)
}

const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const versionPattern = new RegExp(`^${escapedPrefix}(\\d+)\\.(\\d+)\\.(\\d+)$`)

function listReleaseTags() {
  const output = execFileSync('git', ['tag', '--list', `${prefix}*`], {
    encoding: 'utf8'
  })

  return output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => {
      const match = versionPattern.exec(tag)
      if (!match) {
        return null
      }

      return {
        tag,
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
      }
    })
    .filter((tag) => tag !== null)
    .sort((left, right) => {
      if (left.major !== right.major) return left.major - right.major
      if (left.minor !== right.minor) return left.minor - right.minor
      return left.patch - right.patch
    })
}

function computeNextVersion(previousTag) {
  if (!previousTag) {
    if (bump === 'major') {
      return { major: 1, minor: 0, patch: 0 }
    }

    if (bump === 'minor') {
      return { major: 0, minor: 1, patch: 0 }
    }

    return { major: 0, minor: 0, patch: 1 }
  }

  if (bump === 'major') {
    return { major: previousTag.major + 1, minor: 0, patch: 0 }
  }

  if (bump === 'minor') {
    return { major: previousTag.major, minor: previousTag.minor + 1, patch: 0 }
  }

  return { major: previousTag.major, minor: previousTag.minor, patch: previousTag.patch + 1 }
}

const releaseTags = listReleaseTags()
const previousTag = releaseTags.at(-1) ?? null
const nextVersion = computeNextVersion(previousTag)
const nextTag = `${prefix}${nextVersion.major}.${nextVersion.minor}.${nextVersion.patch}`

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `previous_tag=${previousTag?.tag ?? ''}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `next_tag=${nextTag}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, `bump=${bump}\n`)
}

console.log(
  JSON.stringify(
    {
      bump,
      prefix,
      previousTag: previousTag?.tag ?? null,
      nextTag
    },
    null,
    2
  )
)
