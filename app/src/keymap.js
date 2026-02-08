import get from 'lodash/get'
import keyBy from 'lodash/keyBy'
export { loadKeymap } from './api'

export function getBehaviourParams(parsedParams, behaviour) {
  if (!behaviour || typeof behaviour !== 'object') {
    return []
  }

  const behaviourParams = Array.isArray(behaviour.params)
    ? behaviour.params
    : []

  if (!behaviourParams.length && Number.isInteger(behaviour.bindingCells) && behaviour.bindingCells > 0) {
    return Array.from({ length: behaviour.bindingCells }, (_, index) => ({
      name: `Param ${index + 1}`,
      type: 'raw'
    }))
  }

  const firstParsedParam = get(parsedParams, '[0]', {})
  const commands = keyBy(behaviour.commands || [], 'code')
  return [].concat(
    behaviourParams,
    get(behaviourParams, '[0]') === 'command'
      ? get(commands[firstParsedParam.value], 'additionalParams', [])
      : []
  )
}
