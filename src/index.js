#!/usr/bin/env node
'use strict'

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const { makeRank } = require('@hcengineering/rank')

const {
  CLASS,
  NO_PARENT,
  readConfig,
  withClient,
  closeClient,
  updateMarkdownContent
} = require('./huly')

const SortingOrder = { Ascending: 1, Descending: -1 }

function ok (data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// Raw Huly errors (e.g. platform:status:Unauthorized) are hard to act on,
// so translate them into actionable hints.
function explain (msg) {
  if (/Unauthorized|status:Unauthorized/i.test(msg)) {
    return 'Authentication failed or permission denied. Check whether HULY_TOKEN has expired, or whether HULY_EMAIL / HULY_PASSWORD are correct.'
  }
  if (/Workspace .* not found|Workspace not found/i.test(msg)) {
    return 'Workspace not found. HULY_WORKSPACE must be the URL slug from /workbench/<slug>, not the display name shown in the sidebar.'
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return 'Cannot reach the server. Verify that HULY_URL is correct and the service is reachable.'
  }
  if (/timeout|ETIMEDOUT/i.test(msg)) {
    return 'Connection timed out. On a self-hosted setup, make sure your reverse proxy forwards WebSocket upgrades (Upgrade / Connection headers).'
  }
  return null
}

function fail (err) {
  const msg = err && err.message ? err.message : String(err)
  const hint = explain(msg)
  const text = hint ? `Error: ${hint}\n(original message: ${msg})` : `Error: ${msg}`
  return { content: [{ type: 'text', text }], isError: true }
}

// Wrap tool handlers to normalise error output and keep any exception from
// tearing down the MCP connection.
function tool (fn) {
  return async (args) => {
    try {
      return await fn(args || {})
    } catch (err) {
      return fail(err)
    }
  }
}

const server = new McpServer({ name: 'huly-mcp', version: '1.0.0' })

/* -------------------------------- Diagnostics ------------------------------- */

server.registerTool(
  'huly_whoami',
  {
    title: 'Connection check',
    description:
      'Verify the Huly connection and credentials, returning the current account and workspace. Run this first after configuring the server.',
    inputSchema: {}
  },
  tool(async () => {
    const cfg = readConfig()
    return await withClient(async (client) => {
      const account = await client.getAccount()
      return ok({
        url: cfg.url,
        workspace: cfg.workspace,
        authMode: process.env.HULY_TOKEN ? 'token' : 'email/password',
        account: { uuid: account.uuid, role: account.role },
        connected: true
      })
    })
  })
)

/* --------------------------------- Documents -------------------------------- */

server.registerTool(
  'huly_list_teamspaces',
  {
    title: 'List teamspaces',
    description:
      'List all teamspaces (the spaces documents live in). You need a teamspaceId from here before creating a document.',
    inputSchema: {}
  },
  tool(async () =>
    withClient(async (client) => {
      const spaces = await client.findAll(CLASS.teamspace, {}, { limit: 200 })
      return ok(
        spaces.map((s) => ({
          id: s._id,
          name: s.name,
          description: s.description,
          private: s.private,
          archived: s.archived
        }))
      )
    })
  )
)

server.registerTool(
  'huly_list_documents',
  {
    title: 'List documents',
    description:
      'List documents without their content. Filter by teamspaceId for a single space, or by parentId to get child documents. The returned ids can be passed to huly_get_document.',
    inputSchema: {
      teamspaceId: z
        .string()
        .optional()
        .describe('Teamspace ID; omit to search across all spaces'),
      parentId: z.string().optional().describe('Parent document ID; returns its direct children'),
      limit: z.number().int().min(1).max(500).default(100).optional()
    }
  },
  tool(async ({ teamspaceId, parentId, limit = 100 }) =>
    withClient(async (client) => {
      const query = {}
      if (teamspaceId) query.space = teamspaceId
      if (parentId) query.parent = parentId

      const docs = await client.findAll(CLASS.document, query, {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      })
      return ok({
        count: docs.length,
        documents: docs.map((d) => ({
          id: d._id,
          title: d.title,
          teamspaceId: d.space,
          parentId: d.parent === NO_PARENT ? null : d.parent,
          hasContent: d.content != null,
          modifiedOn: new Date(d.modifiedOn).toISOString()
        }))
      })
    })
  )
)

server.registerTool(
  'huly_get_document',
  {
    title: 'Read document content',
    description:
      'Fetch a document title and its full content by ID (markdown by default). Content lives in a collaborative blob, so it can only be retrieved through this tool.',
    inputSchema: {
      documentId: z.string().describe('Document ID'),
      format: z.enum(['markdown', 'html', 'markup']).default('markdown').optional()
    }
  },
  tool(async ({ documentId, format = 'markdown' }) =>
    withClient(async (client) => {
      const doc = await client.findOne(CLASS.document, { _id: documentId })
      if (doc == null) throw new Error(`Document not found: ${documentId}`)

      let content = ''
      if (doc.content != null) {
        content = await client.fetchMarkup(doc._class, doc._id, 'content', doc.content, format)
      }

      return ok({
        id: doc._id,
        title: doc.title,
        teamspaceId: doc.space,
        parentId: doc.parent === NO_PARENT ? null : doc.parent,
        format,
        content,
        modifiedOn: new Date(doc.modifiedOn).toISOString()
      })
    })
  )
)

server.registerTool(
  'huly_search_documents',
  {
    title: 'Search documents',
    description:
      'Search document titles by keyword. Set searchContent=true to also search document bodies (slower, since each document is fetched individually).',
    inputSchema: {
      query: z.string().describe('Keyword (case-insensitive)'),
      teamspaceId: z.string().optional(),
      searchContent: z
        .boolean()
        .default(false)
        .optional()
        .describe('Whether to search document content as well'),
      limit: z.number().int().min(1).max(100).default(25).optional()
    }
  },
  tool(async ({ query, teamspaceId, searchContent = false, limit = 25 }) =>
    withClient(async (client) => {
      const base = {}
      if (teamspaceId) base.space = teamspaceId

      const docs = await client.findAll(CLASS.document, base, { limit: 500 })
      const needle = query.toLowerCase()
      const results = []

      for (const d of docs) {
        if (results.length >= limit) break
        const titleHit = String(d.title || '').toLowerCase().includes(needle)

        if (titleHit) {
          results.push({ id: d._id, title: d.title, teamspaceId: d.space, matchedIn: 'title' })
          continue
        }
        if (!searchContent || d.content == null) continue

        try {
          const md = await client.fetchMarkup(d._class, d._id, 'content', d.content, 'markdown')
          const idx = md.toLowerCase().indexOf(needle)
          if (idx !== -1) {
            results.push({
              id: d._id,
              title: d.title,
              teamspaceId: d.space,
              matchedIn: 'content',
              excerpt: md.slice(Math.max(0, idx - 80), idx + 160).trim()
            })
          }
        } catch {
          // One unreadable document must not abort the whole search.
        }
      }

      return ok({ query, searchContent, count: results.length, results })
    })
  )
)

server.registerTool(
  'huly_create_document',
  {
    title: 'Create document',
    description:
      'Create a new document in a teamspace, with content supplied as markdown. Pass parentId to create it as a child document.',
    inputSchema: {
      teamspaceId: z.string().describe('Teamspace ID (from huly_list_teamspaces)'),
      title: z.string().describe('Document title'),
      content: z.string().default('').optional().describe('Markdown content'),
      parentId: z
        .string()
        .optional()
        .describe('Parent document ID; omit to create a top-level document')
    }
  },
  tool(async ({ teamspaceId, title, content = '', parentId }) =>
    withClient(async (client) => {
      const parent = parentId || NO_PARENT

      // Derive the rank from existing siblings so the new document sorts last.
      const siblings = await client.findAll(
        CLASS.document,
        { space: teamspaceId, parent },
        { limit: 1, sort: { rank: SortingOrder.Descending } }
      )
      const rank = makeRank(siblings[0]?.rank, undefined)

      // content is a collaborative blob, so the document must exist first: create it,
      // get the id, then upload the markup and write the reference back.
      const documentId = await client.createDoc(CLASS.document, teamspaceId, {
        title,
        content: null,
        parent,
        rank
      })

      if (content !== '') {
        const ref = await client.uploadMarkup(
          CLASS.document,
          documentId,
          'content',
          content,
          'markdown'
        )
        await client.updateDoc(CLASS.document, teamspaceId, documentId, { content: ref })
      }

      return ok({ created: true, id: documentId, title, teamspaceId, parentId: parentId || null })
    })
  )
)

server.registerTool(
  'huly_update_document',
  {
    title: 'Update document',
    description:
      'Update a document title or content. content replaces the entire body; to append, first read the document with huly_get_document, merge, then write the result back.',
    inputSchema: {
      documentId: z.string(),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content (replaces the whole body)')
    }
  },
  tool(async ({ documentId, title, content }) =>
    withClient(async (client) => {
      if (title === undefined && content === undefined) {
        throw new Error('Provide at least one of title or content')
      }

      const doc = await client.findOne(CLASS.document, { _id: documentId })
      if (doc == null) throw new Error(`Document not found: ${documentId}`)

      const changed = []

      if (title !== undefined) {
        await client.updateDoc(CLASS.document, doc.space, doc._id, { title })
        changed.push('title')
      }

      if (content !== undefined) {
        if (doc.content == null) {
          // No collaborative content yet: create the blob and write the field back.
          const ref = await client.uploadMarkup(
            doc._class,
            doc._id,
            'content',
            content,
            'markdown'
          )
          await client.updateDoc(CLASS.document, doc.space, doc._id, { content: ref })
        } else {
          // Collaborative content already exists: this must go through the
          // collaborator's updateContent, otherwise the existing collaborative state
          // overrides the new blob and the update silently does nothing.
          await updateMarkdownContent(doc._class, doc._id, 'content', content)
        }
        changed.push('content')
      }

      return ok({ updated: true, id: documentId, fields: changed })
    })
  )
)

server.registerTool(
  'huly_delete_document',
  {
    title: 'Delete document',
    description:
      'Delete a document. This cannot be undone, so confirm the documentId is correct first.',
    inputSchema: {
      documentId: z.string(),
      confirm: z.boolean().describe('Must be explicitly true for the deletion to run')
    }
  },
  tool(async ({ documentId, confirm }) =>
    withClient(async (client) => {
      if (confirm !== true) throw new Error('Not confirmed: deletion requires confirm=true')

      const doc = await client.findOne(CLASS.document, { _id: documentId })
      if (doc == null) throw new Error(`Document not found: ${documentId}`)

      const children = await client.findAll(CLASS.document, { parent: documentId }, { limit: 1 })
      if (children.length > 0) {
        throw new Error('This document still has child documents; handle them before deleting it')
      }

      await client.removeDoc(CLASS.document, doc.space, doc._id)
      return ok({ deleted: true, id: documentId, title: doc.title })
    })
  )
)

/* ---------------------------------- Issues ---------------------------------- */

server.registerTool(
  'huly_list_projects',
  {
    title: 'List projects',
    description: 'List Tracker projects (the spaces issues live in).',
    inputSchema: {}
  },
  tool(async () =>
    withClient(async (client) => {
      const projects = await client.findAll(CLASS.project, {}, { limit: 200 })
      return ok(
        projects.map((p) => ({
          id: p._id,
          name: p.name,
          identifier: p.identifier,
          description: p.description,
          archived: p.archived
        }))
      )
    })
  )
)

server.registerTool(
  'huly_list_issues',
  {
    title: 'List issues',
    description:
      'List issues, optionally filtered by projectId. Results include the status name and the human identifier (e.g. PROJ-12).',
    inputSchema: {
      projectId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50).optional()
    }
  },
  tool(async ({ projectId, limit = 50 }) =>
    withClient(async (client) => {
      const query = {}
      if (projectId) query.space = projectId

      const issues = await client.findAll(CLASS.issue, query, {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      })

      // Fetch the status table once instead of querying per issue.
      const statuses = await client.findAll(CLASS.issueStatus, {}, { limit: 500 })
      const statusName = new Map(statuses.map((s) => [s._id, s.name]))

      return ok({
        count: issues.length,
        issues: issues.map((i) => ({
          id: i._id,
          identifier: i.identifier,
          title: i.title,
          status: statusName.get(i.status) || i.status,
          priority: i.priority,
          projectId: i.space,
          modifiedOn: new Date(i.modifiedOn).toISOString()
        }))
      })
    })
  )
)

server.registerTool(
  'huly_get_issue',
  {
    title: 'Read issue',
    description:
      'Fetch a full issue by internal ID or human identifier (e.g. PROJ-12), including its description and comments.',
    inputSchema: {
      issueId: z.string().optional().describe('Internal issue ID'),
      identifier: z.string().optional().describe('Issue identifier, e.g. PROJ-12')
    }
  },
  tool(async ({ issueId, identifier }) =>
    withClient(async (client) => {
      if (!issueId && !identifier) throw new Error('Provide either issueId or identifier')

      const query = issueId ? { _id: issueId } : { identifier }
      const issue = await client.findOne(CLASS.issue, query)
      if (issue == null) throw new Error(`Issue not found: ${issueId || identifier}`)

      let description = ''
      if (issue.description != null) {
        description = await client.fetchMarkup(
          issue._class,
          issue._id,
          'description',
          issue.description,
          'markdown'
        )
      }

      const status = await client.findOne(CLASS.issueStatus, { _id: issue.status })
      const comments = await client.findAll(
        CLASS.chatMessage,
        { attachedTo: issue._id },
        { limit: 100, sort: { createdOn: SortingOrder.Ascending } }
      )

      return ok({
        id: issue._id,
        identifier: issue.identifier,
        title: issue.title,
        description,
        status: status?.name || issue.status,
        priority: issue.priority,
        projectId: issue.space,
        estimation: issue.estimation,
        comments: comments.map((c) => ({
          message: c.message,
          createdOn: new Date(c.createdOn).toISOString()
        })),
        modifiedOn: new Date(issue.modifiedOn).toISOString()
      })
    })
  )
)

server.registerTool(
  'huly_comment_issue',
  {
    title: 'Comment on issue',
    description: 'Add a comment to an issue.',
    inputSchema: {
      issueId: z.string().optional(),
      identifier: z.string().optional().describe('Issue identifier, e.g. PROJ-12'),
      message: z.string().describe('Comment body')
    }
  },
  tool(async ({ issueId, identifier, message }) =>
    withClient(async (client) => {
      if (!issueId && !identifier) throw new Error('Provide either issueId or identifier')

      const issue = await client.findOne(CLASS.issue, issueId ? { _id: issueId } : { identifier })
      if (issue == null) throw new Error(`Issue not found: ${issueId || identifier}`)

      // ChatMessage.message stores a markup JSON string, not plain text.
      const markup = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: message }] }]
      })

      const commentId = await client.addCollection(
        CLASS.chatMessage,
        issue.space,
        issue._id,
        issue._class,
        'comments',
        { message: markup }
      )

      return ok({ created: true, commentId, issue: issue.identifier })
    })
  )
)

/* --------------------------------- Bootstrap -------------------------------- */

async function main () {
  // Fail fast on missing configuration; the message shows up in the Claude Desktop MCP log.
  readConfig()

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const shutdown = async () => {
    await closeClient()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(`huly-mcp failed to start: ${err && err.message ? err.message : err}`)
  process.exit(1)
})
