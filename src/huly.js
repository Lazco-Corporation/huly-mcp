'use strict'

// Huly connection layer.
// Note: connect() from @hcengineering/api-client runs over WebSocket. Node has no
// global WebSocket, so NodeWebSocketFactory must be passed explicitly or the
// connection fails outright.

const {
  connect,
  NodeWebSocketFactory,
  markdown,
  getWorkspaceToken,
  loadServerConfig
} = require('@hcengineering/api-client')
const { getClient: getCollaboratorClient } = require('@hcengineering/collaborator-client')
const { makeCollabId } = require('@hcengineering/core')
const { jsonToMarkup } = require('@hcengineering/text')
const { markdownToMarkup } = require('@hcengineering/text-markdown')

const CLASS = {
  teamspace: 'document:class:Teamspace',
  document: 'document:class:Document',
  project: 'tracker:class:Project',
  issue: 'tracker:class:Issue',
  issueStatus: 'tracker:class:IssueStatus',
  chatMessage: 'chunter:class:ChatMessage',
  person: 'contact:class:Person'
}

const NO_PARENT = 'document:ids:NoParent'

function readConfig () {
  const url = process.env.HULY_URL
  const workspace = process.env.HULY_WORKSPACE
  const token = process.env.HULY_TOKEN
  const email = process.env.HULY_EMAIL
  const password = process.env.HULY_PASSWORD

  const missing = []
  if (!url) missing.push('HULY_URL')
  if (!workspace) missing.push('HULY_WORKSPACE')
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  }
  if (!token && !(email && password)) {
    throw new Error(
      'Missing credentials: provide HULY_TOKEN, or both HULY_EMAIL and HULY_PASSWORD'
    )
  }

  const auth = token ? { token, workspace } : { email, password, workspace }
  return { url: url.replace(/\/$/, ''), workspace, auth }
}

let clientPromise = null

async function openClient () {
  const { url, auth } = readConfig()
  return await connect(url, {
    ...auth,
    socketFactory: NodeWebSocketFactory,
    connectionTimeout: Number(process.env.HULY_TIMEOUT_MS || 30000)
  })
}

// Connect lazily and drop the cached promise on failure so the next call retries.
async function getClient () {
  if (clientPromise === null) {
    clientPromise = openClient().catch((err) => {
      clientPromise = null
      throw err
    })
  }
  return await clientPromise
}

async function withClient (fn) {
  const client = await getClient()
  try {
    return await fn(client)
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    // Connection-level error: discard the cached client so the next call reconnects.
    if (/socket|closed|ECONNRESET|ETIMEDOUT|network|connection/i.test(msg)) {
      clientPromise = null
    }
    throw err
  }
}

async function closeClient () {
  collabPromise = null
  if (clientPromise === null) return
  const p = clientPromise
  clientPromise = null
  try {
    const client = await p
    await client.close()
  } catch {
    /* A failed close must not break shutdown. */
  }
}

/* ------------------- Real updates for collaborative content ------------------ */

// uploadMarkup in api-client only calls the collaborator's createContent, which has
// "create a new blob" semantics. For a document that already has collaborative state
// the server keeps its existing YDoc and silently discards the new blob, so the update
// appears to succeed but nothing changes. Actually rewriting content requires the
// collaborator's updateContent (updateMarkup), which api-client does not expose --
// hence this hand-rolled collaborator client.
let collabPromise = null

async function getCollaborator () {
  if (collabPromise === null) {
    collabPromise = (async () => {
      const { url, auth } = readConfig()
      const config = await loadServerConfig(url)
      const { token, workspaceId } = await getWorkspaceToken(url, auth, config)

      if (!config.COLLABORATOR_URL) {
        throw new Error(
          'Server has no COLLABORATOR_URL configured; document content cannot be read or written'
        )
      }

      return {
        client: getCollaboratorClient(workspaceId, token, config.COLLABORATOR_URL),
        refUrl: `${url}/browse?workspace=${workspaceId}`,
        imageUrl: `${url}/files?workspace=${workspaceId}&file=`
      }
    })().catch((err) => {
      collabPromise = null
      throw err
    })
  }
  return await collabPromise
}

// Overwrite the collaborative content of a given document attribute with markdown.
async function updateMarkdownContent (objectClass, objectId, objectAttr, md) {
  const { client, refUrl, imageUrl } = await getCollaborator()
  const collabId = makeCollabId(objectClass, objectId, objectAttr)
  const markupStr = jsonToMarkup(markdownToMarkup(md, { refUrl, imageUrl }))
  await client.updateMarkup(collabId, markupStr)
}

module.exports = {
  CLASS,
  NO_PARENT,
  readConfig,
  getClient,
  withClient,
  closeClient,
  markdown,
  updateMarkdownContent
}
