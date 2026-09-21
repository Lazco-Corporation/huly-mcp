#!/usr/bin/env node
'use strict'

// Connection self-check: confirm the configuration is correct before wiring the
// server into Claude Desktop.
// Usage: HULY_URL=... HULY_WORKSPACE=... HULY_EMAIL=... HULY_PASSWORD=... npm run doctor

const { CLASS, readConfig, withClient, closeClient } = require('../src/huly')

function line (label, value) {
  console.log(`  ${label.padEnd(18)} ${value}`)
}

async function main () {
  console.log('\n=== Huly MCP connection check ===\n')

  let cfg
  try {
    cfg = readConfig()
  } catch (err) {
    console.error(`[X] Configuration error: ${err.message}\n`)
    process.exit(1)
  }

  console.log('[1] Environment variables')
  line('HULY_URL', cfg.url)
  line('HULY_WORKSPACE', cfg.workspace)
  line('Auth mode', process.env.HULY_TOKEN ? 'token' : 'email + password')

  console.log('\n[2] Server configuration (config.json)')
  try {
    const res = await fetch(`${cfg.url}/config.json`)
    const conf = await res.json()
    line('VERSION', conf.VERSION)
    line('ACCOUNTS_URL', conf.ACCOUNTS_URL)
    line('COLLABORATOR_URL', conf.COLLABORATOR_URL)
    if (!conf.COLLABORATOR_URL) {
      console.log('  [!] COLLABORATOR_URL is empty; reading and writing document content will fail')
    }
  } catch (err) {
    console.error(`  [X] Could not fetch config.json: ${err.message}`)
    process.exit(1)
  }

  console.log('\n[3] Login and workspace')
  try {
    await withClient(async (client) => {
      const account = await client.getAccount()
      line('Account UUID', account.uuid)
      line('Role', account.role)

      console.log('\n[4] Reading data')
      const teamspaces = await client.findAll(CLASS.teamspace, {}, { limit: 100 })
      line('Teamspaces', `${teamspaces.length}`)
      for (const t of teamspaces.slice(0, 10)) {
        console.log(`      - ${t.name}  (id: ${t._id})`)
      }

      const docs = await client.findAll(CLASS.document, {}, { limit: 500 })
      line('Documents', `${docs.length}`)

      const projects = await client.findAll(CLASS.project, {}, { limit: 100 })
      line('Tracker projects', `${projects.length}`)

      console.log('\n[5] Document content read test')
      const withContent = docs.find((d) => d.content != null)
      if (withContent === undefined) {
        console.log('  (-) No document with content available to test; skipping')
      } else {
        const md = await client.fetchMarkup(
          withContent._class,
          withContent._id,
          'content',
          withContent.content,
          'markdown'
        )
        line('Test document', withContent.title)
        line('Content length', `${md.length} characters`)
        console.log('  [OK] Collaborative content reads correctly')
      }
    })
  } catch (err) {
    console.error(`\n  [X] Failed: ${err.message}`)
    console.error('\n  Common causes:')
    console.error('   - HULY_WORKSPACE must be the URL slug from /workbench/<slug>, not the display name')
    console.error('   - Wrong email or password (Huly locks accounts after repeated failures; prefer a token)')
    console.error('   - Reverse proxy not forwarding WebSocket upgrades (Upgrade / Connection headers)')
    await closeClient()
    process.exit(1)
  }

  await closeClient()
  console.log('\n[OK] All checks passed. You can now wire this into Claude Desktop.\n')
  process.exit(0)
}

main()
