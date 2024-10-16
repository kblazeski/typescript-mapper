import path from 'path'

export const preparePathForImport = (path: string): string => {
  return path.replace('\\', '/')
}

export const findRelativePath = (from: string, to: string) => {
  const fromDir = path.dirname(from)

  const relativePath = preparePathForImport(path.relative(fromDir, to))
  if (!relativePath.startsWith('.')) {
    return './' + relativePath
  }

  return relativePath
}
