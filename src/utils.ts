export const isArray = (value: unknown): boolean => {
  return value != null && Array.isArray(value)
}

const isObject = (value: unknown): boolean => {
  return typeof value === 'object' && !Array.isArray(value) && value !== null
}

export const isObjectOfTypeSourceTargetLocations = (value: unknown): boolean => {
  if (isObject(value)) {
    const objectValue = value as Record<string, any>

    const hasProps = 'source' in objectValue && 'target' in objectValue

    if (hasProps) {
      const sourceValue = objectValue['source']
      const targetValue = objectValue['target']

      return typeof sourceValue === 'string' && typeof targetValue === 'string'
    }
  }
  return false
}
