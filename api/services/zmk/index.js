const {
  parseKeyBinding,
  generateKeymap
} = require('./keymap')

const {
  loadBehaviors,
  loadBehaviorTypes,
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
  loadBehaviorTypes,
  loadKeycodes,
  loadLayout,
  loadSensors,
  loadKeymap,
  exportKeymap
}
