const { Router } = require('express')

const {
  getOauthToken,
  getOauthUser,
  getUserToken,
  verifyUserToken,
  fetchInstallationRepos,
  fetchRepoBranches,
  fetchKeyboardFiles,
  createOauthFlowUrl,
  createOauthReturnUrl,
  commitChanges
} = require('../services/github')
const { createInstallationToken } = require('../services/github/auth')
const { MissingRepoFile } = require('../services/github/files')
const { parseKeymap, validateKeymapJson, KeymapValidationError } = require('../services/zmk/keymap')
const { parseKeymapCode } = require('../services/zmk/keymap-code')
const { validateInfoJson, InfoValidationError } = require('../services/zmk/layout')

const router = Router()

const authorize = async (req, res) => {
  if (req.query.code) {
    try {
      const { data: oauth } = await getOauthToken(req.query.code)
      const { data: user } = await getOauthUser(oauth.access_token)
      const token = getUserToken(oauth, user)
      res.redirect(createOauthReturnUrl(token))
    } catch (err) {
      const message = err.response ? err.response.data : err
      console.error(message)
      res.sendStatus(500)
    }
  } else {
    res.redirect(createOauthFlowUrl())
  }
}

const handleError = (err, req, res, next) => {
  if (err.response && err.response.status === 401) {
    console.error('Received upstream authentication error', err.response.data)
    return res.sendStatus(401)
  } else {
    const message = err.response ? `[${err.response.status}] ${err.response.data}` : err
    console.error(message, err)
  }

  res.sendStatus(500)
}

const authenticate = (req, res, next) => {
  const header = req.headers.authorization
  const token = (header || '').split(' ')[1]

  if (!token) {
    return res.sendStatus(401)
  }

  try {
    req.user = verifyUserToken(token)
  } catch (err) {
    return res.sendStatus(401)
  }

  next()
}

const safeDecodeURIComponent = (v) => {
  if (typeof v !== 'string') {
    return v
  }

  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

const getRepositoryFromParams = (params) => {
  if (params.repository) {
    return safeDecodeURIComponent(params.repository)
  }

  if (params.owner && params.repo) {
    return `${safeDecodeURIComponent(params.owner)}/${safeDecodeURIComponent(params.repo)}`
  }

  return null
}

const getInstallation = async (req, res, next) => {
  const { user } = req
  const { sub: username, oauth_access_token: userToken } = user

  try {
    const installationRepos = await fetchInstallationRepos(userToken)
    if (installationRepos.installations.length === 0) {
      console.log(`User ${username} does not have an active app installation.`)
    }

    res.json(installationRepos)
  } catch (err) {
    next(err)
  }
}

const getBranches = async (req, res, next) => {
  const { installationId } = req.params
  const repository = getRepositoryFromParams(req.params)

  try {
    const { data: { token: installationToken } } = await createInstallationToken(installationId)
    const branches = await fetchRepoBranches(installationToken, repository)

    res.json(branches)
  } catch (err) {
    next(err)
  }
}

const getKeyboardFiles = async (req, res, next) => {
  const { installationId } = req.params
  const repository = getRepositoryFromParams(req.params)
  const { branch } = req.query

  try {
    const { info, keymap, codeKeymap } = await fetchKeyboardFiles(installationId, repository, branch)
    validateInfoJson(info)
    validateKeymapJson(keymap)

    const sensorCount = Array.isArray(info?.sensors) ? info.sensors.length : 0
    if (codeKeymap) {
      const parsedCode = parseKeymapCode(codeKeymap, { sensorCount })
      if (parsedCode?.sensor_layers) {
        keymap.sensor_layers = parsedCode.sensor_layers
      }
      if (Array.isArray(parsedCode?.behavior_overrides)) {
        keymap.behavior_overrides = parsedCode.behavior_overrides
      }
      if (Array.isArray(parsedCode?.behavior_definitions)) {
        keymap.behavior_definitions = parsedCode.behavior_definitions
      }
      if (Array.isArray(parsedCode?.combos)) {
        keymap.combos = parsedCode.combos
      }
      if (Array.isArray(parsedCode?.conditional_layers)) {
        keymap.conditional_layers = parsedCode.conditional_layers
      }
      if (parsedCode?.__keymap_editor?.template) {
        keymap.__keymap_editor = parsedCode.__keymap_editor
      }
    }

    if (!Array.isArray(keymap.sensor_layers) && sensorCount > 0) {
      keymap.sensor_layers = Array.from({ length: keymap.layers.length }, () => (
        Array.from({ length: sensorCount }, () => '&none')
      ))
    }
    if (!Array.isArray(keymap.behavior_overrides)) {
      keymap.behavior_overrides = []
    }
    if (!Array.isArray(keymap.behavior_definitions)) {
      keymap.behavior_definitions = []
    }
    if (!Array.isArray(keymap.combos)) {
      keymap.combos = []
    }
    if (!Array.isArray(keymap.conditional_layers)) {
      keymap.conditional_layers = []
    }

    res.json({
      info,
      keymap: parseKeymap(keymap)
    })
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      console.error(`Validation error in ${repository} (${branch}):`, err.constructor.name, err.errors)
      return res.status(400).json({
        name: err.constructor.name,
        path: err.path,
        errors: err.errors
      })
    } else if (err instanceof InfoValidationError || err instanceof KeymapValidationError) {
      console.error(`Validation error in ${repository} (${branch}):`, err.constructor.name, err.errors)
      return res.status(400).json({
        name: err.name,
        errors: err.errors
      })
    }

    next(err)
  }
}

const updateKeyboardFiles = async (req, res, next) => {
  const { installationId, branch } = req.params
  const repository = getRepositoryFromParams(req.params)
  const { keymap, layout, sensors } = req.body

  try {
    await commitChanges(
      installationId,
      repository,
      safeDecodeURIComponent(branch),
      layout,
      keymap,
      sensors
    )
  } catch (err) {
    return next(err)
  }

  res.sendStatus(200)
}

const receiveWebhook = (req, res) => {
  res.sendStatus(200)
}

router.get('/authorize', authorize)
// Support both styles:
// - /installation/:installationId/:repository/branches (repo is a single segment; may contain %2F)
// - /installation/:installationId/:owner/:repo/branches (repo is split into two segments by upstream decoding)
router.get('/installation/:installationId/:owner/:repo/branches', authenticate, getBranches)
router.get('/installation/:installationId/:repository/branches', authenticate, getBranches)
router.get('/installation', authenticate, getInstallation)
router.get('/keyboard-files/:installationId/:owner/:repo', authenticate, getKeyboardFiles)
router.get('/keyboard-files/:installationId/:repository', authenticate, getKeyboardFiles)
// Branch names can contain slashes, so accept the remainder as :branch(*) when owner/repo are split.
router.post('/keyboard-files/:installationId/:owner/:repo/:branch(*)', authenticate, updateKeyboardFiles)
router.post('/keyboard-files/:installationId/:repository/:branch', authenticate, updateKeyboardFiles)
router.post('/webhook', receiveWebhook)
router.use(handleError)

module.exports = router
