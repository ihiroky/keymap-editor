const fs = require('fs')
const path = require('path')

const { parseKeymapCode } = require('./keymap-code')
const { parseKeyBinding, parseKeymap, generateKeymap } = require('./keymap')
const { isMacroCompatible } = require('./macro-helpers')

const fixturesDir = path.resolve(__dirname, '__fixtures__')
const sourceCode = fs.readFileSync(path.join(fixturesDir, 'roBa.keymap'), 'utf8')
const layoutConfig = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'roBa.json'), 'utf8'))
const layout = layoutConfig.layouts.default_layout.layout
const sensors = Array.isArray(layoutConfig.sensors) ? layoutConfig.sensors : []
const sensorCount = sensors.length

const repositoryRoot = path.resolve(__dirname, '../../../../')
const behaviours = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'api/services/zmk/data/zmk-behaviors.json'), 'utf8'))
const behaviourTypes = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'api/services/zmk/data/zmk-behavior-types.json'), 'utf8'))

function deepClone (value) {
  return JSON.parse(JSON.stringify(value))
}

function parseCode (content = sourceCode) {
  const parsed = parseKeymapCode(content, { sensorCount })
  expect(parsed).not.toBeNull()
  return parsed
}

function parseEditable (content = sourceCode) {
  return parseKeymap(parseCode(content))
}

function generateCode (keymap) {
  return generateKeymap(layout, keymap, undefined, {
    behaviours,
    behaviourTypes,
    sensors
  }).code
}

function findNodeIndex (nodes, name) {
  return (Array.isArray(nodes) ? nodes : []).findIndex(node => node?.name === name)
}

function splitDefinitions (definitions) {
  const macroDefinitions = []
  const behaviorDefinitions = []

  for (const node of Array.isArray(definitions) ? definitions : []) {
    const compatible = node?.properties?.compatible || node?.compatible
    if (isMacroCompatible(compatible)) {
      macroDefinitions.push(node)
    } else {
      behaviorDefinitions.push(node)
    }
  }

  return { macroDefinitions, behaviorDefinitions }
}

function assertTextOutsideSectionsStable (generated) {
  expect(generated).toContain('// arrows {')
  expect(generated).toContain('scroll-layers = <5>;')
  expect(generated).toContain('&kp A             &kp S')
  expect(generated).toContain('#include <dt-bindings/zmk/pointing.h>')
}

function assertSecondSaveIsStable (generated) {
  const regenerated = generateCode(parseKeymap(parseCode(generated)))
  expect(regenerated).toBe(generated)
}

function assertNonKeymapSectionsStable (reparsed, original) {
  expect(reparsed.combos).toEqual(original.combos)
  expect(reparsed.behavior_overrides).toEqual(original.behavior_overrides)
  expect(reparsed.behavior_definitions).toEqual(original.behavior_definitions)
}

describe('roBa keymap round-trip stability', () => {
  test('no-op round-trip keeps the file byte-identical', () => {
    const generated = generateCode(parseEditable())
    expect(generated).toBe(sourceCode)
  })

  test('editing behavior only does not mutate combo/macro semantics', () => {
    const original = parseCode()
    const editable = parseEditable()
    const behaviorIndex = findNodeIndex(editable.behavior_definitions, 'lt_to_layer_0')
    expect(behaviorIndex).toBeGreaterThan(-1)

    editable.behavior_definitions[behaviorIndex].properties['tapping-term-ms'] = 230
    const generated = generateCode(editable)

    expect(generated).toContain('tapping-term-ms = <230>;')
    assertTextOutsideSectionsStable(generated)

    const reparsed = parseCode(generated)
    const originalSplit = splitDefinitions(original.behavior_definitions)
    const reparsedSplit = splitDefinitions(reparsed.behavior_definitions)

    expect(reparsed.combos).toEqual(original.combos)
    expect(reparsed.behavior_overrides).toEqual(original.behavior_overrides)
    expect(reparsedSplit.macroDefinitions).toEqual(originalSplit.macroDefinitions)

    const expectedBehaviors = deepClone(originalSplit.behaviorDefinitions)
    const expectedBehaviorIndex = findNodeIndex(expectedBehaviors, 'lt_to_layer_0')
    expect(expectedBehaviorIndex).toBeGreaterThan(-1)
    expectedBehaviors[expectedBehaviorIndex].properties['tapping-term-ms'] = 230
    expect(reparsedSplit.behaviorDefinitions).toEqual(expectedBehaviors)

    assertSecondSaveIsStable(generated)
  })

  test('editing macro only does not mutate combo/behavior semantics', () => {
    const original = parseCode()
    const editable = parseEditable()
    const macroIndex = findNodeIndex(editable.behavior_definitions, 'to_layer_0')
    expect(macroIndex).toBeGreaterThan(-1)

    editable.behavior_definitions[macroIndex].properties.bindings = [
      '&to 0',
      '&macro_param_1to1',
      '&kp TAB'
    ]
    const generated = generateCode(editable)

    expect(generated).toContain('bindings = <&to 0>, <&macro_param_1to1>, <&kp TAB>;')
    assertTextOutsideSectionsStable(generated)

    const reparsed = parseCode(generated)
    const originalSplit = splitDefinitions(original.behavior_definitions)
    const reparsedSplit = splitDefinitions(reparsed.behavior_definitions)

    expect(reparsed.combos).toEqual(original.combos)
    expect(reparsed.behavior_overrides).toEqual(original.behavior_overrides)
    expect(reparsedSplit.behaviorDefinitions).toEqual(originalSplit.behaviorDefinitions)

    const expectedMacros = deepClone(originalSplit.macroDefinitions)
    const expectedMacroIndex = findNodeIndex(expectedMacros, 'to_layer_0')
    expect(expectedMacroIndex).toBeGreaterThan(-1)
    expectedMacros[expectedMacroIndex].properties.bindings = [
      '&to 0',
      '&macro_param_1to1',
      '&kp TAB'
    ]
    expect(reparsedSplit.macroDefinitions).toEqual(expectedMacros)

    assertSecondSaveIsStable(generated)
  })

  test('editing combo only does not mutate behavior/macro semantics', () => {
    const original = parseCode()
    const editable = parseEditable()
    const comboIndex = findNodeIndex(editable.combos, 'eq')
    expect(comboIndex).toBeGreaterThan(-1)

    editable.combos[comboIndex].properties.bindings = ['&kp PLUS']
    const generated = generateCode(editable)

    expect(generated).toContain('bindings = <&kp PLUS>;')
    assertTextOutsideSectionsStable(generated)

    const reparsed = parseCode(generated)
    const expectedCombos = deepClone(original.combos)
    const expectedComboIndex = findNodeIndex(expectedCombos, 'eq')
    expect(expectedComboIndex).toBeGreaterThan(-1)
    expectedCombos[expectedComboIndex].properties.bindings = ['&kp PLUS']

    expect(reparsed.combos).toEqual(expectedCombos)
    expect(reparsed.behavior_overrides).toEqual(original.behavior_overrides)
    expect(reparsed.behavior_definitions).toEqual(original.behavior_definitions)

    assertSecondSaveIsStable(generated)
  })

  test('editing keymap binding only does not mutate combo/macro/behavior semantics', () => {
    const original = parseCode()
    const editable = parseEditable()

    editable.layers[0][0] = parseKeyBinding('&kp GRAVE')
    const generated = generateCode(editable)

    expect(generated).toContain('&kp GRAVE')
    assertTextOutsideSectionsStable(generated)

    const reparsed = parseCode(generated)
    const expectedLayers = deepClone(original.layers)
    expectedLayers[0][0] = '&kp GRAVE'

    expect(reparsed.layers).toEqual(expectedLayers)
    expect(reparsed.sensor_layers).toEqual(original.sensor_layers)
    assertNonKeymapSectionsStable(reparsed, original)

    assertSecondSaveIsStable(generated)
  })
})
