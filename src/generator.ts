import fs from 'fs'
import hb from 'handlebars'
import path from 'path'
import { findRelativePath, isPathRelative, joinPaths } from 'src/path-utils'
import {
  ConfigFileEntriesTuple,
  ImportObject,
  InterfaceObject,
  MapperObject,
  PropObject,
  TemplateObject,
} from 'src/types'
import { escapeQuotationMarks, isArray, isObjectOfTypeSourceTargetLocations } from 'src/utils'
import * as ts from 'typescript'
import { fileURLToPath } from 'url'

const generateObjectsAndImportsForInterfacesInFile = (fileLocation: string): [InterfaceObject[], ImportObject[]] => {
  const program = ts.createProgram([fileLocation], { allowJs: true, strictNullChecks: true })
  const typeChecker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(fileLocation)

  const interfaceObjects: InterfaceObject[] = []
  const importObjects: ImportObject[] = []

  const traverseNode = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.ExportKeyword) {
      const parent = node.parent
      if (ts.isInterfaceDeclaration(parent)) {
        const interfaceObject: InterfaceObject = {
          name: parent.name.text,
          props: {},
        }

        parent.members.forEach((prop) => {
          const name = (prop.name as any)?.escapedText
          const type = (prop as any)?.type

          interfaceObject.props[name] = {
            type: typeChecker.typeToString(typeChecker.getTypeAtLocation(type)),
            hasQuestionMark: Boolean(prop.questionToken),
          }
        })

        interfaceObjects.push(interfaceObject)
      }
    }

    if (ts.isImportDeclaration(node)) {
      const importPath = escapeQuotationMarks(node.moduleSpecifier.getText())
      
      importObjects.push({
        sourceFilePath: fileLocation,
        importText: node.getFullText(),
        path: importPath,
        wasRelative: isPathRelative(importPath),
      })
    }

    // Loop through the root AST nodes of the file
    ts.forEachChild(node, traverseNode)
  }

  traverseNode(sourceFile as ts.Node)

  return [interfaceObjects, importObjects]
}

const isTypeNullable = (type: string | null | undefined, hasQuestionMark: boolean): boolean => {
  if (type === undefined || type === null || hasQuestionMark === undefined || hasQuestionMark === null) {
    return false
  }
  return type.indexOf('null') !== -1 || type.indexOf('undefined') !== -1 || hasQuestionMark
}

const getReturnType = (prop: PropObject): string => {
  return prop.hasQuestionMark ? prop.type + ' | undefined' : prop.type
}

const filterNullableUnionTypes = (type?: PropObject['type']): string | undefined => {
  // TODO: extract this into global variable
  const unionType = '|'
  const filteredTypes = type
    ?.split(unionType)
    .map((item) => item.trim())
    .filter((type) => type !== 'undefined' && type !== 'null')
    .join(unionType)

  return filteredTypes
}

// from -> to
// if from is nullable and to expects non nullable -> we add custom value (dont map but expect customMap)
// if from is nullable and to is nullable -> can be mapped
// if from is not nullable and to is nullable -> can be mapped
// if from is not nullable and to is not nullable -> can be mapped
const generateMappersForInterfaces = (
  sourceObjects: InterfaceObject[],
  targetObjects: InterfaceObject[],
): MapperObject[] => {
  const mapperObjects: MapperObject[] = []
  sourceObjects.forEach((sourceObject) => {
    targetObjects.forEach((targetObject) => {
      const mapperObject: MapperObject = {
        sourceType: sourceObject.name,
        targetType: targetObject.name,
        customMapOptional: true,
        autoMapProps: [],
        customMapProps: [],
      }

      const sourceObjectProps = sourceObject.props
      const targetObjectProps = targetObject.props

      const targetObjectPropsKeys = Object.keys(targetObjectProps)

      // auto mapped properties
      const autoMapProps = new Set<string>()
      const customMapProps: MapperObject['customMapProps'] = []

      targetObjectPropsKeys.forEach((prop) => {
        const targetProp = targetObjectProps[prop]
        const sourceProp = sourceObjectProps[prop]

        const targetPropType = targetProp.type
        const sourcePropType = sourceProp?.type

        const targetPropTypeWithoutNullableTypes = filterNullableUnionTypes(targetPropType)
        const sourcePropTypeWithoutNullableTypes = filterNullableUnionTypes(sourcePropType)

        const targetPropNullable = isTypeNullable(targetPropType, targetProp.hasQuestionMark)
        const sourcePropNullable = isTypeNullable(sourcePropType, sourceProp?.hasQuestionMark)

        if (prop in sourceObjectProps && targetPropTypeWithoutNullableTypes === sourcePropTypeWithoutNullableTypes) {
          // TODO: refactor this
          // if from is nullable and to expects non nullable -> we add custom value (dont map but expect customMap)
          if (sourcePropNullable && !targetPropNullable) {
            customMapProps.push({
              propName: prop,
              returnType: getReturnType(targetProp),
              isOptional: false,
            })
          } else {
            autoMapProps.add(prop)
            customMapProps.push({ propName: prop, returnType: getReturnType(targetProp), isOptional: true })
          }
        } else {
          customMapProps.push({ propName: prop, returnType: getReturnType(targetProp), isOptional: false })
        }
      })

      mapperObject.autoMapProps = Array.from(autoMapProps)
      mapperObject.customMapOptional = customMapProps.every((item) => item.isOptional)
      mapperObject.customMapProps = customMapProps

      mapperObjects.push(mapperObject)
    })
  })

  return mapperObjects
}

export const generateObjectsForSourcesAndTarget = (
  sourceLocation: string,
  targetLocation: string,
): [InterfaceObject[], InterfaceObject[], ImportObject[]] => {
  const [sourceObjects, sourceImportObjects] = generateObjectsAndImportsForInterfacesInFile(sourceLocation)
  const [targetObjects, targetImportObjects] = generateObjectsAndImportsForInterfacesInFile(targetLocation)

  const combinedImportObjects = [...sourceImportObjects, ...targetImportObjects]

  return [sourceObjects, targetObjects, combinedImportObjects]
}

const extractConfigFileEntries = (configFileContent: string): ConfigFileEntriesTuple[] => {
  const tuplesArray: Array<ConfigFileEntriesTuple> = []

  const array = JSON.parse(configFileContent)

  if (!isArray(array)) {
    throw new Error('The value in the json file is not array as expected')
  }

  array.forEach((item: any) => {
    if (!isObjectOfTypeSourceTargetLocations(item)) {
      throw new Error('The value inside of the array is not the expected type of object')
    }
    tuplesArray.push([item['source'], item['target'], item['viceVersa']])
  })

  const uniqueEntries = new Set(tuplesArray.map((item) => JSON.stringify(item)))

  return Array.from(uniqueEntries).map((item) => JSON.parse(item)) as ConfigFileEntriesTuple[]
}

export const getImportForTheInterfaces = (
  locationOfInterface: string,
  interfaceNames: string[],
  locationOfOutputFile: string,
): string | undefined => {
  const path = findRelativePath(locationOfOutputFile, locationOfInterface)
  const interfaces = interfaceNames.join(', ')

  if (interfaceNames.length > 0) {
    return `import { ${interfaces} } from \"${path}\"`
  }
}

// TODO: only transforms them relative to the source path, not the the mappings.ts
const transformImportPaths = (importObjects: ImportObject[], outputFilePath: string): string[] => {
  // transform relative paths in the source file to fit the relative path in the destination file of mappers
  const transformedRelativePaths = importObjects.map((item) => {
    let transformedPath = item.path

    if (item.wasRelative) {
      const absolutePathRelativeToSourceFile = joinPaths(item.sourceFilePath, item.path)
      const relativePathToOutputFile = findRelativePath(outputFilePath, absolutePathRelativeToSourceFile)
      transformedPath = relativePathToOutputFile
    }

    return item.importText.replace(item.path, transformedPath)
  })
  return Array.from(new Set(transformedRelativePaths))
}

export const createTemplateObject = (
  configFileEntries: ConfigFileEntriesTuple[],
  outputFilePath: string,
): TemplateObject => {
  const templateObject: TemplateObject = {
    imports: [],
    mappers: [],
  }

  const uniqueCombinedImports = new Set<string>()

  for (const [sourceLocation, targetLocation, viceVersa] of configFileEntries) {
    if (fs.existsSync(sourceLocation) && fs.existsSync(targetLocation)) {
      console.log(`Mapping from source: "${sourceLocation}" to target: "${targetLocation}"`)

      const [sources, targets, imports] = generateObjectsForSourcesAndTarget(sourceLocation, targetLocation)
      const transformedImportsFromImportsInsideOfFiles = transformImportPaths(imports, outputFilePath)

      const sourcesInterfaceNames = sources.map((item) => item.name)
      const targetsInterfaceNames = targets.map((item) => item.name)

      const sourcesFileImport = getImportForTheInterfaces(sourceLocation, sourcesInterfaceNames, outputFilePath)
      const targetsFileImport = getImportForTheInterfaces(targetLocation, targetsInterfaceNames, outputFilePath)

      if (sourcesFileImport) {
        uniqueCombinedImports.add(sourcesFileImport)
      }

      if (targetsFileImport) {
        uniqueCombinedImports.add(targetsFileImport)
      }

      transformedImportsFromImportsInsideOfFiles.forEach((item) => {
        uniqueCombinedImports.add(item)
      })

      const mappers = generateMappersForInterfaces(sources, targets)
      templateObject.mappers.push(...mappers)

      if (viceVersa) {
        console.log(`Mapping from source: "${targetLocation}" to target: "${sourceLocation}"`)

        const viceVersaMappers = generateMappersForInterfaces(targets, sources)
        templateObject.mappers.push(...viceVersaMappers)
      }
    }
  }

  templateObject.imports = Array.from(uniqueCombinedImports)

  return templateObject
}

export const generateMappers = (configForMappingFilesLocation: string, outputFileLocation: string): void => {
  if (!fs.existsSync(configForMappingFilesLocation)) {
    const errorMessage = 'You need to specify a JSON config file with the mapping specification'
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const configFile = fs.readFileSync(configForMappingFilesLocation).toString('utf-8')

  const templateFile = fs.readFileSync(path.resolve(__dirname, 'template.handlebars')).toString('utf-8')

  let configFileEntries: ConfigFileEntriesTuple[]

  try {
    configFileEntries = extractConfigFileEntries(configFile)
  } catch (error: any) {
    console.error(error?.message)
    throw error
  }

  const templateObject = createTemplateObject(configFileEntries, outputFileLocation)

  const { imports, mappers } = templateObject

  const writer = fs.createWriteStream(outputFileLocation)

  for (const itemImport of imports) {
    const itemImportWithNewLine = itemImport + '\n'
    writer.write(itemImportWithNewLine)
  }

  for (const mapper of mappers) {
    const template = hb.compile(templateFile)

    const mappedContent = template(mapper)

    writer.write(mappedContent)
  }

  writer.close()
}
