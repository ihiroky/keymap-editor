const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { parseKeymap } = require('./keymap')
const { parseKeymapCode } = require('./keymap-code')

const ZMK_PATH = path.join(__dirname, '..', '..', '..', 'zmk-config')

const EMPTY_KEYMAP = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown',
  layer_names: ['default'],
  layers: [[]]
}

function loadBehaviors () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-behaviors.json')))
}

function loadKeycodes () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-keycodes.json')))
}

function getLocalZmkConfigInfo () {
  const rootPath = path.resolve(__dirname, '..', '..', '..')
  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  const configDir = entries.find(entry => (
    entry.name.startsWith('zmk-config-') && fs.existsSync(path.join(rootPath, entry.name, 'config'))
  ))

  if (!configDir) {
    return null
  }

  const suffix = configDir.name.slice('zmk-config-'.length)
  if (!suffix) {
    return null
  }

  return { rootPath, configDir, suffix }
}

function findLocalLayoutJsonPath () {
  const info = getLocalZmkConfigInfo()
  if (!info) {
    return null
  }

  const layoutPath = path.join(info.rootPath, info.configDir.name, 'config', `${info.suffix}.json`)
  return fs.existsSync(layoutPath) ? layoutPath : null
}

function findLocalKeymapPath () {
  const info = getLocalZmkConfigInfo()
  if (!info) {
    return null
  }

  const keymapPath = path.join(info.rootPath, info.configDir.name, 'config', `${info.suffix}.keymap`)
  return fs.existsSync(keymapPath) ? keymapPath : null
}

function loadLayout (layout = 'LAYOUT') {
  const localLayoutPath = findLocalLayoutJsonPath()
  if (localLayoutPath) {
    const localLayout = JSON.parse(fs.readFileSync(localLayoutPath))
    const layouts = localLayout?.layouts
    if (layouts && typeof layouts === 'object') {
      const fallbackKeys = Object.keys(layouts)
      const preferredKeys = ['default', ...fallbackKeys]
      for (const key of preferredKeys) {
        const entry = layouts[key]
        if (Array.isArray(entry?.layout)) {
          return entry.layout
        }
      }
    }
  }

  const layoutPath = path.join(ZMK_PATH, 'config', 'info.json')
  return JSON.parse(fs.readFileSync(layoutPath)).layouts[layout].layout
}

function loadSensors () {
  const localLayoutPath = findLocalLayoutJsonPath()
  if (localLayoutPath) {
    const localLayout = JSON.parse(fs.readFileSync(localLayoutPath))
    if (Array.isArray(localLayout?.sensors)) {
      return localLayout.sensors
    }
  }

  const layoutPath = path.join(ZMK_PATH, 'config', 'info.json')
  const info = JSON.parse(fs.readFileSync(layoutPath))
  return Array.isArray(info?.sensors) ? info.sensors : []
}

function loadKeymap () {
  const localKeymapPath = findLocalKeymapPath()
  if (localKeymapPath) {
    const sensorCount = loadSensors().length
    const codeKeymap = parseKeymapCode(fs.readFileSync(localKeymapPath, 'utf8'), { sensorCount })
    if (codeKeymap) {
      return parseKeymap(codeKeymap)
    }
  }

  const sensorCount = loadSensors().length
  const keymapPath = path.join(ZMK_PATH, 'config', 'keymap.json')
  const keymapContent = fs.existsSync(keymapPath)
    ? JSON.parse(fs.readFileSync(keymapPath))
    : EMPTY_KEYMAP

  if (!Array.isArray(keymapContent.sensor_layers) && sensorCount > 0) {
    keymapContent.sensor_layers = Array.from({ length: keymapContent.layers.length }, () => (
      Array.from({ length: sensorCount }, () => '&none')
    ))
  }

  return parseKeymap(keymapContent)
}

function findKeymapFile () {
  const files = fs.readdirSync(path.join(ZMK_PATH, 'config'))
  return files.find(file => file.endsWith('.keymap'))
}

function exportKeymap (generatedKeymap, flash, callback) {
  const keymapPath = path.join(ZMK_PATH, 'config')
  const keymapFile = findKeymapFile()

  fs.existsSync(keymapPath) || fs.mkdirSync(keymapPath)
  fs.writeFileSync(path.join(keymapPath, 'keymap.json'), generatedKeymap.json)
  fs.writeFileSync(path.join(keymapPath, keymapFile), generatedKeymap.code)

  // Note: This isn't really helpful. In the QMK version I had this actually
  // calling `make` and piping the output in realtime but setting up a ZMK dev
  // environment proved to be more complex than I had patience for, so for now
  // I'm writing changes to a zmk-config repo and counting on the predefined
  // GitHub action to actually compile.
  return childProcess.execFile('git', ['status'], { cwd: ZMK_PATH }, callback)
}

module.exports = {
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadSensors,
  loadKeymap,
  exportKeymap
}
