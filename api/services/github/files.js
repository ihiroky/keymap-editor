const api = require('./api')
const auth = require('./auth')
const zmk = require('../zmk')
const { parseKeymapCode } = require('../zmk/keymap-code')

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
  const sensorCount = Array.isArray(info?.sensors) ? info.sensors.length : 0
  const keymap = await fetchKeymap(installationToken, repository, branch, { sensorCount })
  const codeKeymap = await fetchCodeKeymapContent(installationToken, repository, branch)
  return { info, keymap, codeKeymap }
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

async function fetchKeymap (installationToken, repository, branch, options = {}) {
  try {
    const { data : keymap } = await fetchFile(installationToken, repository, 'config/keymap.json', { raw: true, branch })
    return keymap
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      const converted = await convertKeymapFromCode(installationToken, repository, branch, options)
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

async function fetchCodeKeymapContent (installationToken, repository, branch) {
  try {
    const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
    const { data: content } = await fetchFile(installationToken, repository, originalCodeKeymap.path, { branch, raw: true })
    return content
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return null
    }

    throw err
  }
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


async function convertKeymapFromCode (installationToken, repository, branch, options = {}) {
  try {
    const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
    const { data: content } = await fetchFile(installationToken, repository, originalCodeKeymap.path, { branch, raw: true })
    return parseKeymapCode(content, options)
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return null
    }

    throw err
  }
}

async function commitChanges (installationId, repository, branch, layout, keymap, sensors) {
  const { data: { token: installationToken } } = await auth.createInstallationToken(installationId)
  const template = await findCodeKeymapTemplate(installationToken, repository, branch)
  let sensorConfig = Array.isArray(sensors) ? sensors : null
  if (!sensorConfig) {
    try {
      const { data: info } = await fetchInfoFile(installationToken, repository, branch)
      sensorConfig = Array.isArray(info?.sensors) ? info.sensors : []
    } catch {
      sensorConfig = []
    }
  }

  const generatedKeymap = zmk.generateKeymap(layout, keymap, template, { sensors: sensorConfig })

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
