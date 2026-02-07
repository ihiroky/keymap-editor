const {
  parseKeyBinding,
  generateKeymap
} = require('./keymap')

const {
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadSensors,
  loadKeymap,
  exportKeymap
} = require('./local-source')

module.exports = {
  parseKeyBinding,
  generateKeymap,
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadSensors,
  loadKeymap,
  exportKeymap
}
