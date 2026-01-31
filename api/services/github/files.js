const api = require('./api')
const auth = require('./auth')
const zmk = require('../zmk')

const MODE_FILE = '100644'
const REPO_PREFIX = 'zmk-config-'
const KEYMAP_ROOT = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown'
}

class MissingRepoFile extends Error {
  constructor(path) {
    super()
    this.name = 'MissingRepoFile'
    this.path = path
    this.errors = [`Missing file ${path}`]
  }
}

function getRepositoryName (repository) {
  if (!repository || typeof repository !== 'string') {
    return ''
  }

  const parts = repository.split('/').filter(Boolean)
  return parts[parts.length - 1] || repository
}

function getRepoInfoPath (repository) {
  const repoName = getRepositoryName(repository)
  const stripped = repoName.startsWith(REPO_PREFIX) ? repoName.slice(REPO_PREFIX.length) : repoName
  const layoutName = stripped || repoName
  return `config/${layoutName}.json`
}

function normalizeRepoInfo (info) {
  if (typeof info !== 'object' || info === null) {
    return info
  }

  const layouts = info.layouts
  if (typeof layouts !== 'object' || layouts === null) {
    return info
  }

  const entry = Object.entries(layouts).find(([, layout]) => Array.isArray(layout?.layout))
  if (!entry) {
    return Object.assign({}, info, { layouts: {} })
  }

  const [, layout] = entry
  return Object.assign({}, info, { layouts: { LAYOUT: layout } })
}

async function fetchKeyboardFiles (installationId, repository, branch) {
  const { data: { token: installationToken } } = await auth.createInstallationToken(installationId)
  const { data: info } = await fetchInfoFile(installationToken, repository, branch)
  const keymap = await fetchKeymap(installationToken, repository, branch)
  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
  return { info, keymap, originalCodeKeymap }
}

async function fetchInfoFile (installationToken, repository, branch) {
  const repoInfoPath = getRepoInfoPath(repository)

  try {
    const { data } = await fetchFile(installationToken, repository, repoInfoPath, { raw: true, branch })
    return { data: normalizeRepoInfo(data), source: repoInfoPath }
  } catch (err) {
    if (!(err instanceof MissingRepoFile)) {
      throw err
    }
  }

  return fetchFile(installationToken, repository, 'config/info.json', { raw: true, branch })
}

async function fetchKeymap (installationToken, repository, branch) {
  try {
    const { data : keymap } = await fetchFile(installationToken, repository, 'config/keymap.json', { raw: true, branch })
    return keymap
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      const converted = await convertKeymapFromCode(installationToken, repository, branch)
      if (converted) {
        return converted
      }

      return Object.assign({}, KEYMAP_ROOT, {
        layer_names: ['default'],
        layers: [[]]
      })
    } else {
      throw err
    }
  }
}

async function fetchFile (installationToken, repository, path, options = {}) {
  const { raw = false, branch = null } = options
  const url = `/repos/${repository}/contents/${path}`
  const params = {}

  if (branch) {
    params.ref = branch
  }

  const headers = { Accept: raw ? 'application/vnd.github.v3.raw' : 'application/json' }
  try {
    return await api.request({ url, headers, params, token: installationToken })
  } catch (err) {
    if (err.response?.status === 404) {
      throw new MissingRepoFile(path)
    }
  }
}

async function findCodeKeymap (installationToken, repository, branch) {
  // Assume that the relevant files are under `config/` and not a complicated
  // directory structure, and that there are fewer than 1000 files in this path
  // (a limitation of GitHub's repo contents API).
  const { data: directory } = await fetchFile(installationToken, repository, 'config', { branch })
  const originalCodeKeymap = directory.find(file => file.name.toLowerCase().endsWith('.keymap'))

  if (!originalCodeKeymap) {
    throw new MissingRepoFile('config/*.keymap')
  }

  return originalCodeKeymap
}

async function findCodeKeymapTemplate (installationToken, repository, branch) {
  // Assume that the relevant files are under `config/` and not a complicated
  // directory structure, and that there are fewer than 1000 files in this path
  // (a limitation of GitHub's repo contents API).
  const { data: directory } = await fetchFile(installationToken, repository, 'config', { branch })
  const template = directory.find(file => file.name.toLowerCase().endsWith('.keymap.template'))

  if (template) {
    const { data: content } = await fetchFile(installationToken, repository, template.path, { branch, raw: true })
    return content
  }
}

function stripComments (content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function extractBlockWithIndex (content, startIndex) {
  let depth = 0
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return { block: content.slice(startIndex + 1, i), end: i }
      }
    }
  }

  return null
}

function parseBindings (bindingsBlock) {
  const tokens = bindingsBlock
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  const bindings = []
  let current = []

  for (const token of tokens) {
    if (token.startsWith('&')) {
      if (current.length) {
        bindings.push(current.join(' '))
      }
      current = [token]
    } else if (current.length) {
      current.push(token)
    }
  }

  if (current.length) {
    bindings.push(current.join(' '))
  }

  return bindings
}

function normalizeAngleValue (value) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }
  return trimmed
}

function parsePropertyValue (rawValue) {
  const trimmed = rawValue.trim()
  const quoted = trimmed.match(/^"([\s\S]*)"$/)
  if (quoted) {
    return quoted[1]
  }

  const angleMatches = Array.from(trimmed.matchAll(/<([^>]+)>/g))
  if (angleMatches.length) {
    const values = angleMatches.map(match => normalizeAngleValue(match[1]))
    return values.length === 1 ? values[0] : values
  }

  return normalizeAngleValue(trimmed)
}

function parseProperties (content) {
  const properties = {}
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*([^;]+);/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    properties[match[1]] = parsePropertyValue(match[2])
  }

  return properties
}

function findBlocks (content) {
  const blocks = []
  const pattern = /([A-Za-z0-9_&\/-]+)\s*\{/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    const name = match[1]
    const braceIndex = content.indexOf('{', match.index)
    const extracted = extractBlockWithIndex(content, braceIndex)
    if (!extracted) {
      break
    }

    blocks.push({ name, content: extracted.block, start: match.index, end: extracted.end })
    pattern.lastIndex = extracted.end + 1
  }

  return blocks
}

function stripBlocks (content, blocks) {
  let result = content
  const sorted = [...blocks].sort((a, b) => b.start - a.start)
  for (const block of sorted) {
    result = result.slice(0, block.start) + ' ' + result.slice(block.end + 1)
  }
  return result
}

function parseNode (content) {
  const blocks = findBlocks(content)
  const children = {}
  const order = []

  for (const block of blocks) {
    children[block.name] = parseNode(block.content)
    order.push(block.name)
  }

  const properties = parseProperties(stripBlocks(content, blocks))
  return { properties, children, order }
}

function parseDts (content) {
  const cleaned = stripComments(content)
  const includes = Array.from(
    cleaned.matchAll(/^\s*#include\s+([<"][^>"]+[>"])\s*$/gm)
  ).map(match => match[1])
  const withoutIncludes = cleaned.replace(/^\s*#include\s+[<"][^>"]+[>"]\s*$/gm, '')

  const blocks = findBlocks(withoutIncludes)
  const nodes = {}
  const order = []
  for (const block of blocks) {
    nodes[block.name] = parseNode(block.content)
    order.push(block.name)
  }

  return { includes, nodes, order }
}

function extractKeymapLayers (keymapNode) {
  if (!keymapNode || !keymapNode.children) {
    return null
  }

  const layerNames = []
  const layers = []
  const layerDetails = {}
  const order = keymapNode.order.length ? keymapNode.order : Object.keys(keymapNode.children)

  for (const name of order) {
    const layerNode = keymapNode.children[name]
    if (!layerNode || !layerNode.properties?.bindings) {
      continue
    }

    const bindings = typeof layerNode.properties.bindings === 'string'
      ? parseBindings(layerNode.properties.bindings)
      : Array.isArray(layerNode.properties.bindings)
        ? layerNode.properties.bindings.map(value => String(value))
        : []

    if (!bindings.length) {
      continue
    }

    const sensorBindingsRaw = layerNode.properties['sensor-bindings']
    const sensorBindings = typeof sensorBindingsRaw === 'string'
      ? parseBindings(sensorBindingsRaw)
      : Array.isArray(sensorBindingsRaw)
        ? sensorBindingsRaw.map(value => String(value))
        : undefined

    layerNames.push(name)
    layers.push(bindings)
    layerDetails[name] = {
      properties: layerNode.properties,
      bindings,
      sensor_bindings: sensorBindings
    }
  }

  if (!layers.length) {
    return null
  }

  return { layerNames, layers, layerDetails }
}

function parseKeymapCode (content) {
  const dts = parseDts(content)
  const keymapNode = dts.nodes['/']?.children?.keymap
  const extracted = extractKeymapLayers(keymapNode)
  if (!extracted) {
    return null
  }

  return Object.assign({}, KEYMAP_ROOT, {
    layer_names: extracted.layerNames,
    layers: extracted.layers
  })
}

async function convertKeymapFromCode (installationToken, repository, branch) {
  try {
    const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
    const { data: content } = await fetchFile(installationToken, repository, originalCodeKeymap.path, { branch, raw: true })
    return parseKeymapCode(content)
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return null
    }

    throw err
  }
}

async function commitChanges (installationId, repository, branch, layout, keymap) {
  const { data: { token: installationToken } } = await auth.createInstallationToken(installationId)
  const template = await findCodeKeymapTemplate(installationToken, repository, branch)

  const generatedKeymap = zmk.generateKeymap(layout, keymap, template)

  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
  const { data: {sha, commit} } = await api.request({ url: `/repos/${repository}/commits/${branch}`, token: installationToken })

  const { data: { sha: newTreeSha } } = await api.request({
    url: `/repos/${repository}/git/trees`,
    method: 'POST',
    token: installationToken,
    data: {
      base_tree: commit.tree.sha,
      tree: [
        {
          path: originalCodeKeymap.path,
          mode: MODE_FILE,
          type: 'blob',
          content: generatedKeymap.code
        },
        {
          path: 'config/keymap.json',
          mode: MODE_FILE,
          type: 'blob',
          content: generatedKeymap.json
        }
      ]
    }
  })

  const { data: { sha: newSha } } = await api.request({
    url: `/repos/${repository}/git/commits`,
    method: 'POST',
    token: installationToken,
    data: {
      tree: newTreeSha,
      message: 'Updated keymap',
      parents: [sha]
    }
  })

  await api.request({
    url: `/repos/${repository}/git/refs/heads/${branch}`,
    method: 'PATCH',
    token: installationToken,
    data: {
      sha: newSha
    }
  })
}

module.exports = {
  MissingRepoFile,
  fetchKeyboardFiles,
  findCodeKeymap,
  commitChanges
}
