import { chromium } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, '..')
const outputDir = path.join(appDir, 'store-assets', 'generated')
const iconSourcePath = path.join(appDir, 'assets', 'icon.png')

const BRAND = {
  surface: '#ffffff',
  surfaceAlt: '#fff9fb',
  surfaceMuted: '#fff1f4',
  text: '#211820',
  textMuted: '#5f5560',
  textSubdued: '#8a7a85',
  primary: '#f43b57',
  primaryEmphasis: '#d92c47',
  primaryAccent: '#ff7a8e',
  border: 'rgba(185, 69, 90, 0.18)',
  borderStrong: '#ddb0ba'
}

const screenshotTargets = [
  {
    key: 'apple/iphone-6.5',
    label: 'Apple iPhone 6.5"',
    width: 1284,
    height: 2778
  },
  {
    key: 'google/phone',
    label: 'Google Play phone',
    width: 1080,
    height: 1920
  },
  {
    key: 'google/tablet-7',
    label: 'Google Play 7-inch tablet',
    width: 1206,
    height: 2144
  },
  {
    key: 'google/tablet-10',
    label: 'Google Play 10-inch tablet',
    width: 1440,
    height: 2560
  }
]

function createSvgDataUri(markup) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`
}

function createAvatar(label, primary, secondary) {
  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="100%" stop-color="${secondary}" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="64" fill="url(#bg)" />
      <circle cx="128" cy="94" r="42" fill="rgba(255,255,255,0.18)" />
      <path d="M66 210c12-38 38-56 62-56s50 18 62 56" fill="rgba(255,255,255,0.18)" />
      <text x="128" y="156" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700" text-anchor="middle">${label}</text>
    </svg>
  `)
}

function createMediaCard(title, subtitle, accent) {
  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#fff9fb" />
          <stop offset="100%" stop-color="#ffeef2" />
        </linearGradient>
      </defs>
      <rect width="1200" height="720" fill="url(#bg)" />
      <circle cx="1036" cy="130" r="148" fill="${accent}" opacity="0.15" />
      <circle cx="190" cy="590" r="174" fill="${accent}" opacity="0.1" />
      <rect x="80" y="92" width="1040" height="536" rx="42" fill="#ffffff" opacity="0.96" />
      <text x="150" y="220" fill="#211820" font-family="Arial, Helvetica, sans-serif" font-size="66" font-weight="700">${title}</text>
      <text x="150" y="310" fill="#5f5560" font-family="Arial, Helvetica, sans-serif" font-size="34">${subtitle}</text>
      <rect x="150" y="392" width="360" height="24" rx="12" fill="${accent}" opacity="0.24" />
      <rect x="150" y="446" width="620" height="24" rx="12" fill="#f1d5dd" />
      <rect x="150" y="494" width="520" height="24" rx="12" fill="#f1d5dd" />
    </svg>
  `)
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function formatRelative(isoValue) {
  const timestamp = new Date(isoValue).getTime()
  const diff = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < hour) {
    const minutes = Math.max(1, Math.round(diff / minute))
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`
  }

  if (diff < day) {
    const hours = Math.max(1, Math.round(diff / hour))
    return `${hours} hr${hours === 1 ? '' : 's'} ago`
  }

  return new Date(isoValue).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const users = [
  {
    id: 'viewer-1',
    handle: 'leul',
    displayName: 'Leul Tewolde',
    bio: 'Building the mobile beta for Mereb. Focused on calm collaboration, fast updates, and direct messaging.',
    followersCount: 182,
    followingCount: 64,
    avatarUrl: createAvatar('L', '#f43b57', '#ff8aa0'),
    createdAt: daysAgo(180)
  },
  {
    id: 'user-2',
    handle: 'hana',
    displayName: 'Hana Tesfaye',
    bio: 'Operations lead keeping launches aligned across teams and time zones.',
    followersCount: 143,
    followingCount: 58,
    avatarUrl: createAvatar('H', '#4c7ef3', '#76a6ff'),
    createdAt: daysAgo(220)
  },
  {
    id: 'user-3',
    handle: 'samrawit',
    displayName: 'Samrawit Alem',
    bio: 'Product design and feedback loops for member-facing flows.',
    followersCount: 121,
    followingCount: 75,
    avatarUrl: createAvatar('S', '#7e5bef', '#9c82ff'),
    createdAt: daysAgo(140)
  },
  {
    id: 'user-4',
    handle: 'dawit',
    displayName: 'Dawit Bekele',
    bio: 'Backend and data pipelines for profile, feed, and messaging services.',
    followersCount: 98,
    followingCount: 44,
    avatarUrl: createAvatar('D', '#0f9d8d', '#63c8bd'),
    createdAt: daysAgo(200)
  },
  {
    id: 'user-5',
    handle: 'liya',
    displayName: 'Liya Worku',
    bio: 'Community success and launch enablement.',
    followersCount: 167,
    followingCount: 88,
    avatarUrl: createAvatar('L', '#ff8b3d', '#ffc078'),
    createdAt: daysAgo(170)
  }
]

const posts = [
  {
    id: 'post-1',
    author: users[0],
    body: 'Shipping the store beta checklist today. Login-only access is locked down, support and privacy are live, and the first signed builds are queued for QA.',
    createdAt: hoursAgo(2),
    likeCount: 42,
    commentCount: 7,
    repostCount: 3
  },
  {
    id: 'post-2',
    author: users[1],
    body: 'The mobile beta now puts updates, people discovery, and direct messaging in one focused workflow.',
    createdAt: hoursAgo(5),
    likeCount: 31,
    commentCount: 4,
    repostCount: 2,
    mediaUrl: createMediaCard(
      'Team updates',
      'Focused updates, profiles, and messages in one mobile workspace.',
      BRAND.primary
    )
  },
  {
    id: 'post-3',
    author: users[2],
    body: 'Design pass for the release build is complete. The iOS and Android screenshots can now reflect the real flows without staging-only affordances.',
    createdAt: hoursAgo(11),
    likeCount: 24,
    commentCount: 5,
    repostCount: 1
  }
]

const conversations = [
  {
    id: 'design-partners',
    title: 'Design partners',
    updatedAt: hoursAgo(1),
    unreadCount: 2,
    body: 'I uploaded the final screenshot crop set for review.'
  },
  {
    id: 'ops-brief',
    title: 'Ops brief',
    updatedAt: hoursAgo(4),
    unreadCount: 0,
    body: 'Store metadata is lined up once the screenshots land.'
  },
  {
    id: 'launch-thread',
    title: 'Launch thread',
    updatedAt: hoursAgo(10),
    unreadCount: 1,
    body: 'Android keystore is stored remotely and verified.'
  }
]

const conversationMessages = [
  {
    id: 'message-1',
    sender: 'Leul Tewolde',
    own: true,
    body: 'The store preview routes are ready. I am capturing the final image set next.',
    sentAt: hoursAgo(7)
  },
  {
    id: 'message-2',
    sender: 'Liya Worku',
    own: false,
    body: 'Support copy looks good. Keep the screenshots focused on feed, people, profile, and messaging.',
    sentAt: hoursAgo(6)
  },
  {
    id: 'message-3',
    sender: 'Samrawit Alem',
    own: false,
    body: 'I want the icon and feature graphic to feel connected to the app, not like separate marketing art.',
    sentAt: hoursAgo(5)
  },
  {
    id: 'message-4',
    sender: 'Samrawit Alem',
    own: false,
    body: 'I uploaded the final screenshot crop set for review.',
    sentAt: hoursAgo(1)
  }
]

function screenshotDocument(content) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          :root {
            --surface: ${BRAND.surface};
            --surface-alt: ${BRAND.surfaceAlt};
            --surface-muted: ${BRAND.surfaceMuted};
            --text: ${BRAND.text};
            --text-muted: ${BRAND.textMuted};
            --text-subdued: ${BRAND.textSubdued};
            --primary: ${BRAND.primary};
            --primary-emphasis: ${BRAND.primaryEmphasis};
            --primary-accent: ${BRAND.primaryAccent};
            --border: ${BRAND.border};
            --border-strong: ${BRAND.borderStrong};
            --space-1: clamp(8px, 1.1vw, 16px);
            --space-2: clamp(12px, 1.5vw, 20px);
            --space-3: clamp(16px, 2vw, 26px);
            --space-4: clamp(22px, 2.5vw, 34px);
            --space-5: clamp(28px, 3.1vw, 42px);
            --radius: clamp(18px, 2.4vw, 30px);
            --shadow: 0 22px 48px rgba(33, 24, 32, 0.12);
          }
          * {
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: var(--surface-alt);
            font-family: Arial, Helvetica, sans-serif;
            color: var(--text);
          }
          body {
            display: block;
          }
          .screen {
            width: 100vw;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background:
              radial-gradient(circle at top right, rgba(244, 59, 87, 0.14), transparent 28%),
              linear-gradient(180deg, #fff9fb 0%, #fff4f7 100%);
          }
          .statusbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: calc(var(--space-2) + 6px) var(--space-4) var(--space-2);
            font-size: clamp(14px, 1.7vw, 22px);
            font-weight: 700;
            color: var(--text);
          }
          .nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: var(--space-2);
            padding: 0 var(--space-4) var(--space-3);
          }
          .nav-title {
            font-size: clamp(28px, 3vw, 42px);
            font-weight: 700;
            line-height: 1.05;
          }
          .nav-copy {
            margin-top: 6px;
            font-size: clamp(14px, 1.6vw, 22px);
            line-height: 1.45;
            color: var(--text-muted);
          }
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            padding: 0 var(--space-4) var(--space-3);
          }
          .card {
            border-radius: var(--radius);
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid var(--border);
            padding: var(--space-3);
            box-shadow: var(--shadow);
          }
          .card.tight {
            padding: var(--space-2);
          }
          .section-title {
            font-size: clamp(22px, 2.4vw, 34px);
            font-weight: 700;
            line-height: 1.1;
          }
          .section-body {
            margin-top: 8px;
            font-size: clamp(14px, 1.6vw, 22px);
            line-height: 1.45;
            color: var(--text-muted);
          }
          .composer {
            margin-top: var(--space-2);
            min-height: 11.6vh;
            padding: var(--space-3);
            border-radius: calc(var(--radius) - 6px);
            border: 1px solid var(--border-strong);
            background: var(--surface-alt);
            font-size: clamp(15px, 1.7vw, 24px);
            color: var(--text-subdued);
          }
          .actions {
            margin-top: var(--space-2);
            display: flex;
            justify-content: space-between;
            gap: var(--space-2);
          }
          .button {
            min-height: 52px;
            padding: 0 calc(var(--space-3) + 4px);
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: clamp(14px, 1.6vw, 22px);
            font-weight: 700;
            border: 1px solid transparent;
            white-space: nowrap;
          }
          .button.primary {
            background: var(--primary);
            color: #ffffff;
          }
          .button.secondary {
            background: var(--surface);
            color: var(--text);
            border-color: var(--border-strong);
          }
          .button-group {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-2);
          }
          .row {
            display: flex;
            align-items: center;
            gap: var(--space-2);
          }
          .row-between {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--space-2);
          }
          .avatar {
            width: clamp(44px, 5vw, 72px);
            height: clamp(44px, 5vw, 72px);
            border-radius: 50%;
            object-fit: cover;
            background: var(--surface-muted);
            flex: none;
          }
          .avatar.large {
            width: clamp(72px, 8.3vw, 116px);
            height: clamp(72px, 8.3vw, 116px);
          }
          .flex {
            flex: 1;
            min-width: 0;
          }
          .title {
            font-size: clamp(16px, 1.9vw, 28px);
            font-weight: 700;
            line-height: 1.15;
          }
          .meta {
            margin-top: 6px;
            font-size: clamp(13px, 1.4vw, 20px);
            line-height: 1.35;
            color: var(--text-subdued);
          }
          .body {
            margin-top: var(--space-2);
            font-size: clamp(15px, 1.7vw, 24px);
            line-height: 1.45;
          }
          .metrics {
            margin-top: var(--space-2);
            display: flex;
            gap: var(--space-3);
            flex-wrap: wrap;
            font-size: clamp(12px, 1.4vw, 20px);
            font-weight: 600;
            color: var(--text-subdued);
          }
          .metric-grid {
            display: flex;
            gap: var(--space-4);
            margin-top: var(--space-2);
          }
          .metric-value {
            font-size: clamp(28px, 3vw, 42px);
            font-weight: 700;
            line-height: 1;
          }
          .metric-label {
            margin-top: 6px;
            font-size: clamp(12px, 1.4vw, 20px);
            color: var(--text-subdued);
          }
          .search {
            width: 100%;
            border-radius: calc(var(--radius) - 6px);
            border: 1px solid var(--border-strong);
            background: var(--surface-alt);
            padding: var(--space-2) var(--space-3);
            font-size: clamp(15px, 1.7vw, 24px);
            color: var(--text-subdued);
          }
          .list {
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
          }
          .user-row {
            display: flex;
            align-items: center;
            gap: var(--space-2);
          }
          .media {
            display: block;
            width: 100%;
            margin-top: var(--space-2);
            border-radius: calc(var(--radius) - 6px);
            object-fit: cover;
            background: var(--surface-muted);
            aspect-ratio: 1.55;
          }
          .tabbar {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: var(--space-1);
            padding: var(--space-2) var(--space-3) calc(var(--space-3) + 8px);
            border-top: 1px solid var(--border-strong);
            background: rgba(255, 249, 251, 0.96);
          }
          .tab {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            color: var(--text-subdued);
            font-size: clamp(12px, 1.2vw, 18px);
            font-weight: 700;
          }
          .tab.active {
            color: var(--primary-emphasis);
          }
          .icon-dot {
            width: clamp(18px, 2vw, 28px);
            height: clamp(18px, 2vw, 28px);
            border-radius: 999px;
            background: currentColor;
            opacity: 0.9;
          }
          .readonly {
            border-radius: calc(var(--radius) - 6px);
            border: 1px solid var(--border-strong);
            background: var(--surface-alt);
            padding: var(--space-2) var(--space-3);
            font-size: clamp(15px, 1.7vw, 24px);
            line-height: 1.45;
          }
          .readonly.multiline {
            min-height: 10vh;
          }
          .hero {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 var(--space-4) var(--space-5);
          }
          .hero-card {
            width: 100%;
            max-width: min(88vw, 820px);
            padding: var(--space-5);
          }
          .eyebrow {
            display: inline-flex;
            align-items: center;
            padding: 10px 16px;
            border-radius: 999px;
            background: rgba(244, 59, 87, 0.12);
            color: var(--primary-emphasis);
            font-size: clamp(12px, 1.3vw, 18px);
            font-weight: 700;
            letter-spacing: 1px;
          }
          .hero-title {
            margin-top: var(--space-3);
            font-size: clamp(38px, 4.2vw, 62px);
            line-height: 1.04;
            font-weight: 700;
          }
          .hero-copy {
            margin-top: var(--space-2);
            font-size: clamp(16px, 1.9vw, 28px);
            line-height: 1.5;
            color: var(--text-muted);
          }
          .meta-links {
            margin-top: var(--space-2);
            display: flex;
            gap: var(--space-3);
            color: var(--primary-emphasis);
            font-size: clamp(14px, 1.5vw, 22px);
            font-weight: 700;
          }
          .thread {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
            padding: 0 var(--space-4) var(--space-3);
          }
          .bubble-list {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
          }
          .bubble {
            max-width: 84%;
            padding: var(--space-3);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
          }
          .bubble.own {
            align-self: flex-end;
            background: var(--surface-muted);
            border-top-right-radius: 18px;
          }
          .bubble.other {
            align-self: flex-start;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid var(--border);
            border-top-left-radius: 18px;
          }
          .bubble-sender {
            font-size: clamp(12px, 1.3vw, 18px);
            font-weight: 700;
            color: var(--primary-emphasis);
          }
          .bubble-body {
            margin-top: 8px;
            font-size: clamp(15px, 1.7vw, 24px);
            line-height: 1.42;
          }
          .bubble-meta {
            margin-top: 8px;
            font-size: clamp(12px, 1.3vw, 18px);
            color: var(--text-subdued);
          }
          .composer-row {
            display: flex;
            gap: var(--space-2);
          }
          .composer-input {
            flex: 1;
            min-height: 54px;
            display: flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid var(--border-strong);
            background: rgba(255, 255, 255, 0.92);
            padding: 0 var(--space-3);
            font-size: clamp(15px, 1.7vw, 24px);
            color: var(--text-subdued);
          }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `
}

function renderTabs(activeTab) {
  const tabs = [
    ['feed', 'Feed'],
    ['people', 'People'],
    ['messages', 'Messages'],
    ['profile', 'Profile']
  ]

  return `
    <div class="tabbar">
      ${tabs
        .map(
          ([key, label]) => `
            <div class="tab ${key === activeTab ? 'active' : ''}">
              <div class="icon-dot"></div>
              <div>${label}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `
}

function renderAppFrame({ title, subtitle = '', content, activeTab }) {
  return `
    <div class="screen">
      <div class="statusbar">
        <span>9:41</span>
        <span>LTE 100%</span>
      </div>
      <div class="nav">
        <div class="flex">
          <div class="nav-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="nav-copy">${escapeHtml(subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="content">${content}</div>
      ${renderTabs(activeTab)}
    </div>
  `
}

function renderFeedScreen() {
  return renderAppFrame({
    title: 'Feed',
    subtitle: 'Focused team updates and launch progress in one stream.',
    activeTab: 'feed',
    content: `
      <div class="card">
        <div class="section-title">Share an update</div>
        <div class="section-body">Keep your team aligned with crisp announcements, launch notes, and progress snapshots.</div>
        <div class="composer">What should your network see?</div>
        <div class="actions">
          <div class="button secondary">Attach image</div>
          <div class="button primary">Post update</div>
        </div>
      </div>
      ${posts
        .map(
          (post) => `
            <div class="card">
              <div class="row">
                <img class="avatar" src="${post.author.avatarUrl}" alt="" />
                <div class="flex">
                  <div class="title">${escapeHtml(post.author.displayName)}</div>
                  <div class="meta">@${escapeHtml(post.author.handle)} • ${formatRelative(post.createdAt)}</div>
                </div>
              </div>
              <div class="body">${escapeHtml(post.body)}</div>
              ${
                post.mediaUrl
                  ? `<img class="media" src="${post.mediaUrl}" alt="" />`
                  : ''
              }
              <div class="metrics">
                <span>${post.likeCount} likes</span>
                <span>${post.commentCount} comments</span>
                <span>${post.repostCount} reposts</span>
              </div>
            </div>
          `
        )
        .join('')}
    `
  })
}

function renderPeopleScreen() {
  return renderAppFrame({
    title: 'People',
    subtitle: 'Search members, follow collaborators, and find the right conversations faster.',
    activeTab: 'people',
    content: `
      <div class="card">
        <div class="search">Search people</div>
      </div>
      <div class="card">
        <div class="section-title">Discover people</div>
        <div class="section-body">Follow active members to improve the relevance of your feed and uncover more conversations.</div>
        <div class="list" style="margin-top: var(--space-2);">
          ${users
            .slice(1)
            .map(
              (user, index) => `
                <div class="user-row">
                  <img class="avatar" src="${user.avatarUrl}" alt="" />
                  <div class="flex">
                    <div class="title">${escapeHtml(user.displayName)}</div>
                    <div class="meta">@${escapeHtml(user.handle)}</div>
                    <div class="meta" style="color: var(--text-muted);">${escapeHtml(user.bio)}</div>
                  </div>
                  <div class="button secondary">${index < 2 ? 'Following' : 'Follow'}</div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `
  })
}

function renderMessagesScreen() {
  return renderAppFrame({
    title: 'Messages',
    subtitle: 'Conversations stay focused on launch work, feedback, and decisions.',
    activeTab: 'messages',
    content: `
      <div class="card tight">
        <div class="row-between">
          <div class="search" style="flex: 1;">Search conversations</div>
          <div class="button secondary">New chat</div>
        </div>
      </div>
      ${conversations
        .map(
          (conversation) => `
            <div class="card">
              <div class="row-between">
                <div class="title">${escapeHtml(conversation.title)}</div>
                <div class="meta">${formatRelative(conversation.updatedAt)}</div>
              </div>
              <div class="body">${escapeHtml(conversation.body)}</div>
              <div class="metrics">
                <span>${conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : 'Up to date'}</span>
              </div>
            </div>
          `
        )
        .join('')}
    `
  })
}

function renderConversationScreen() {
  return `
    <div class="screen">
      <div class="statusbar">
        <span>9:41</span>
        <span>LTE 100%</span>
      </div>
      <div class="nav">
        <div class="flex">
          <div class="nav-title">Design partners</div>
          <div class="nav-copy">Direct feedback on screenshots, icon polish, and release readiness.</div>
        </div>
      </div>
      <div class="thread">
        <div class="bubble-list">
          ${conversationMessages
            .map(
              (message) => `
                <div class="bubble ${message.own ? 'own' : 'other'}">
                  <div class="bubble-sender">${escapeHtml(message.sender)}</div>
                  <div class="bubble-body">${escapeHtml(message.body)}</div>
                  <div class="bubble-meta">${formatRelative(message.sentAt)}</div>
                </div>
              `
            )
            .join('')}
        </div>
        <div class="composer-row">
          <div class="composer-input">Write a message</div>
          <div class="button primary">Send</div>
        </div>
      </div>
    </div>
  `
}

function renderProfileScreen() {
  const viewer = users[0]

  return renderAppFrame({
    title: 'Profile',
    subtitle: 'Edit account details, review help resources, and keep your network in reach.',
    activeTab: 'profile',
    content: `
      <div class="card">
        <div class="row">
          <img class="avatar large" src="${viewer.avatarUrl}" alt="" />
          <div class="flex">
            <div class="nav-title" style="font-size: clamp(28px, 3vw, 40px);">${escapeHtml(viewer.displayName)}</div>
            <div class="meta">@${escapeHtml(viewer.handle)}</div>
            <div class="meta">Joined ${formatRelative(viewer.createdAt)}</div>
          </div>
        </div>
        <div class="metric-grid">
          <div>
            <div class="metric-value">${viewer.followersCount}</div>
            <div class="metric-label">Followers</div>
          </div>
          <div>
            <div class="metric-value">${viewer.followingCount}</div>
            <div class="metric-label">Following</div>
          </div>
        </div>
        <div class="body">${escapeHtml(viewer.bio)}</div>
        <div class="button-group">
          <div class="button secondary">Update avatar</div>
          <div class="button secondary">Find people</div>
          <div class="button secondary">Log out</div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Account settings</div>
        <div class="meta" style="margin-top: var(--space-2);">Display name</div>
        <div class="readonly">${escapeHtml(viewer.displayName)}</div>
        <div class="meta" style="margin-top: var(--space-2);">Bio</div>
        <div class="readonly multiline">${escapeHtml(viewer.bio)}</div>
        <div class="actions" style="justify-content: flex-end;">
          <div class="button primary">Save changes</div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Help and privacy</div>
        <div class="section-body">Review support guidance and the latest privacy policy before sharing this beta build more broadly.</div>
        <div class="button-group">
          <div class="button secondary">Support</div>
          <div class="button secondary">Privacy policy</div>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Following</div>
        <div class="list" style="margin-top: var(--space-2);">
          ${users
            .slice(1, 4)
            .map(
              (user) => `
                <div class="user-row">
                  <img class="avatar" src="${user.avatarUrl}" alt="" />
                  <div class="flex">
                    <div class="title">${escapeHtml(user.displayName)}</div>
                    <div class="meta">@${escapeHtml(user.handle)}</div>
                  </div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    `
  })
}

function renderLoginScreen() {
  return `
    <div class="screen">
      <div class="statusbar">
        <span>9:41</span>
        <span>LTE 100%</span>
      </div>
      <div class="hero">
        <div class="card hero-card">
          <div class="eyebrow">PRIVATE TEAM NETWORK</div>
          <div class="hero-title">Welcome to Mereb Social</div>
          <div class="hero-copy">
            Sign in to collaborate with your teams, follow updates, review member profiles,
            and keep direct messages close at hand from the same secure workspace.
          </div>
          <div class="button-group" style="margin-top: var(--space-3);">
            <div class="button primary">Log in</div>
            <div class="button secondary">Invite-only beta</div>
          </div>
          <div class="section-body" style="margin-top: var(--space-3);">
            Mobile beta access is currently login-only. Support and privacy guidance are available
            directly from the app once signed in.
          </div>
          <div class="meta-links">
            <span>Support</span>
            <span>Privacy policy</span>
          </div>
        </div>
      </div>
    </div>
  `
}

const screenTemplates = [
  { id: 'feed', render: renderFeedScreen },
  { id: 'people', render: renderPeopleScreen },
  { id: 'messages', render: renderMessagesScreen },
  { id: 'conversation', render: renderConversationScreen },
  { id: 'profile', render: renderProfileScreen },
  { id: 'login', render: renderLoginScreen }
]

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true })
}

async function withPage(browser, width, height, work) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()

  try {
    return await work(page)
  } finally {
    await context.close()
  }
}

async function renderScreen(browser, width, height, markup, outputPath) {
  await ensureDir(path.dirname(outputPath))

  await withPage(browser, width, height, async (page) => {
    await page.setContent(screenshotDocument(markup), { waitUntil: 'load' })
    await page.screenshot({
      path: outputPath,
      animations: 'disabled'
    })
  })
}

async function fileToDataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const mimeType =
    extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/png'
  const data = await fs.readFile(filePath)
  return `data:${mimeType};base64,${data.toString('base64')}`
}

async function renderIcon(browser, width, height, inputDataUri, outputPath) {
  await ensureDir(path.dirname(outputPath))

  await withPage(browser, width, height, async (page) => {
    await page.setContent(
      `
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            background: #ffffff;
          }
          img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
          }
        </style>
        <img src="${inputDataUri}" alt="" />
      `,
      { waitUntil: 'load' }
    )
    await page.screenshot({
      path: outputPath,
      animations: 'disabled'
    })
  })
}

async function renderFeatureGraphic(browser, outputPath, assets) {
  await ensureDir(path.dirname(outputPath))

  await withPage(browser, 1024, 500, async (page) => {
    await page.setContent(
      `
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background:
              radial-gradient(circle at top right, rgba(244, 59, 87, 0.24), transparent 34%),
              radial-gradient(circle at bottom left, rgba(255, 138, 160, 0.26), transparent 30%),
              linear-gradient(135deg, #fff9fb 0%, #ffeef2 100%);
            font-family: Arial, Helvetica, sans-serif;
          }
          .canvas {
            position: relative;
            width: 1024px;
            height: 500px;
            overflow: hidden;
          }
          .copy {
            position: absolute;
            top: 54px;
            left: 64px;
            width: 412px;
            z-index: 3;
          }
          .eyebrow {
            display: inline-flex;
            padding: 10px 16px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 1px;
            color: #c22f48;
            background: rgba(244, 59, 87, 0.12);
          }
          h1 {
            margin: 20px 0 0;
            font-size: 52px;
            line-height: 1.02;
            color: #211820;
          }
          p {
            margin: 18px 0 0;
            font-size: 20px;
            line-height: 1.45;
            color: #5f5560;
          }
          .chips {
            display: flex;
            gap: 12px;
            margin-top: 26px;
            flex-wrap: wrap;
          }
          .chip {
            padding: 11px 16px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 700;
            color: #7a3342;
            background: rgba(255, 255, 255, 0.78);
            border: 1px solid rgba(221, 176, 186, 0.7);
            box-shadow: 0 12px 24px rgba(33, 24, 32, 0.08);
          }
          .icon-shell {
            position: absolute;
            right: 330px;
            bottom: 56px;
            width: 92px;
            height: 92px;
            padding: 10px;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.82);
            box-shadow: 0 16px 30px rgba(33, 24, 32, 0.12);
            z-index: 4;
          }
          .icon-shell img {
            width: 100%;
            height: 100%;
            display: block;
            border-radius: 20px;
          }
          .phones {
            position: absolute;
            right: 38px;
            top: 24px;
            width: 484px;
            height: 452px;
          }
          .phone {
            position: absolute;
            border-radius: 38px;
            padding: 12px;
            background: #17161a;
            box-shadow: 0 28px 60px rgba(33, 24, 32, 0.18);
          }
          .phone::before {
            content: "";
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            width: 112px;
            height: 18px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
          }
          .phone img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 28px;
          }
          .phone.primary {
            right: 134px;
            top: 8px;
            width: 188px;
            height: 408px;
            transform: rotate(-8deg);
          }
          .phone.secondary {
            right: 0;
            top: 74px;
            width: 176px;
            height: 382px;
            transform: rotate(8deg);
          }
        </style>
        <div class="canvas">
          <div class="copy">
            <div class="eyebrow">PRIVATE TEAM NETWORK</div>
            <h1>Mereb Social</h1>
            <p>Updates, profiles, and direct messages in one focused mobile workspace.</p>
            <div class="chips">
              <div class="chip">Feed</div>
              <div class="chip">People</div>
              <div class="chip">Messages</div>
              <div class="chip">Profile</div>
            </div>
          </div>
          <div class="icon-shell">
            <img src="${assets.icon}" alt="" />
          </div>
          <div class="phones">
            <div class="phone primary">
              <img src="${assets.feed}" alt="" />
            </div>
            <div class="phone secondary">
              <img src="${assets.messages}" alt="" />
            </div>
          </div>
        </div>
      `,
      { waitUntil: 'load' }
    )

    await page.screenshot({
      path: outputPath,
      animations: 'disabled'
    })
  })
}

async function writeManifest(manifest) {
  const manifestPath = path.join(outputDir, 'manifest.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifestPath
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true })
  await ensureDir(outputDir)
  const browser = await chromium.launch({ headless: true })

  try {
    const manifest = {
      generatedAt: new Date().toISOString(),
      requirements: {
        apple: {
          screenshotSize: '1284x2778',
          screenshotReference:
            'Apple App Store Connect screenshot specifications for 6.5-inch display'
        },
        google: {
          phoneScreenshotSize: '1080x1920',
          tablet7ScreenshotSize: '1206x2144',
          tablet10ScreenshotSize: '1440x2560',
          iconSize: '512x512',
          featureGraphicSize: '1024x500'
        }
      },
      files: []
    }

    for (const target of screenshotTargets) {
      const targetDir = path.join(outputDir, target.key)
      await ensureDir(targetDir)

      for (const screen of screenTemplates) {
        const outputPath = path.join(targetDir, `${screen.id}.png`)
        await renderScreen(browser, target.width, target.height, screen.render(), outputPath)
        manifest.files.push({
          type: 'screenshot',
          suite: target.label,
          page: screen.id,
          path: path.relative(appDir, outputPath),
          width: target.width,
          height: target.height
        })
      }
    }

    const iconDataUri = await fileToDataUri(iconSourcePath)
    const appleIconPath = path.join(outputDir, 'apple', 'app-store-icon-1024.png')
    const googleIconPath = path.join(outputDir, 'google', 'play-icon-512.png')

    await renderIcon(browser, 1024, 1024, iconDataUri, appleIconPath)
    await renderIcon(browser, 512, 512, iconDataUri, googleIconPath)

    manifest.files.push(
      {
        type: 'icon',
        suite: 'Apple App Store',
        path: path.relative(appDir, appleIconPath),
        width: 1024,
        height: 1024
      },
      {
        type: 'icon',
        suite: 'Google Play',
        path: path.relative(appDir, googleIconPath),
        width: 512,
        height: 512
      }
    )

    const featureGraphicPath = path.join(outputDir, 'google', 'feature-graphic-1024x500.png')
    const googleFeedPath = path.join(outputDir, 'google', 'phone', 'feed.png')
    const googleMessagesPath = path.join(outputDir, 'google', 'phone', 'messages.png')

    await renderFeatureGraphic(browser, featureGraphicPath, {
      icon: await fileToDataUri(appleIconPath),
      feed: await fileToDataUri(googleFeedPath),
      messages: await fileToDataUri(googleMessagesPath)
    })

    manifest.files.push({
      type: 'feature-graphic',
      suite: 'Google Play',
      path: path.relative(appDir, featureGraphicPath),
      width: 1024,
      height: 500
    })

    const manifestPath = await writeManifest(manifest)
    console.log(`Store assets written to ${outputDir}`)
    console.log(`Manifest written to ${manifestPath}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
