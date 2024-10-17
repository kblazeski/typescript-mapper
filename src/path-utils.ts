import path from 'path'

export const isPathRelative = (path: string): boolean => {
  return path.startsWith('.')
}

export const preparePathForImport = (path: string): string => {
  return path.replaceAll('\\', '/')
}

export const findRelativePath = (from: string, to: string) => {
  const fromDir = path.dirname(from)

  const relativePath = preparePathForImport(path.relative(fromDir, to))
  if (!relativePath.startsWith('.')) {
    return './' + relativePath
  }

  return relativePath
}

export const joinPaths = (from: string, to: string): string => {
  return path.join(path.dirname(from), to)
}
