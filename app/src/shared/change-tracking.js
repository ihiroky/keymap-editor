import cloneDeep from 'lodash/cloneDeep'
import isEqual from 'lodash/isEqual'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function hasChanged(baseValue, currentValue) {
  return !isEqual(baseValue, currentValue)
}

export function getListChangeInfo(baseList, currentList) {
  const base = asArray(baseList)
  const current = asArray(currentList)
  const changedIndices = new Set()

  for (let index = 0; index < current.length; index += 1) {
    if (!isEqual(current[index], base[index])) {
      changedIndices.add(index)
    }
  }

  const addedCount = Math.max(0, current.length - base.length)
  const deletedCount = Math.max(0, base.length - current.length)

  return {
    changedIndices,
    addedCount,
    deletedCount
  }
}

export function isAddedIndex(baseList, index) {
  return index >= asArray(baseList).length
}

export function isIndexAdded(index, baseLength) {
  return index >= Number(baseLength || 0)
}

export function isIndexChanged(baseList, currentList, index) {
  const base = asArray(baseList)
  const current = asArray(currentList)
  return !isEqual(current[index], base[index])
}

export function revertItemByIndex(baseList, currentList, index) {
  const base = asArray(baseList)
  const current = asArray(currentList)

  if (index < 0 || index >= current.length) {
    return [...current]
  }

  if (index >= base.length) {
    return [
      ...current.slice(0, index),
      ...current.slice(index + 1)
    ]
  }

  return [
    ...current.slice(0, index),
    cloneDeep(base[index]),
    ...current.slice(index + 1)
  ]
}
