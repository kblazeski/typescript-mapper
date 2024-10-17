import fs from 'fs'
import hb from 'handlebars'
import path from 'path'
import { findRelativePath, isPathRelative, joinPaths } from 'src/path-utils'
import {
  ConfigFileEntriesTuple,
  Import,
  ImportObject,
  InterfaceObject,
  MapperObject,
  PropObject,
  TemplateObject,
} from 'src/types'
import { isArray, isObjectOfTypeSourceTargetLocations } from 'src/utils'
import * as ts from 'typescript'
import { fileURLToPath } from 'url'

// TODO: only transforms them relative to the source path, not the the mappings.ts
const transformImportPaths = (sourceFilePathOfObjects: string, importObjects: ImportObject[]): string[] => {
  // transform relative paths in the source file to fit the relative path in the destination file of mappers
  const transformedRelativePaths = importObjects.map((item) => {
    const transformedPath = item.wasRelative ? joinPaths(sourceFilePathOfObjects, item.path) : item.path
    return item.importText.replace(item.path, transformedPath)
  })
  return Array.from(new Set(transformedRelativePaths))
}

const generateObjectsAndImportsForInterfacesInFile = (fileLocation: string): [InterfaceObject[], Import[]] => {
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
      importObjects.push({
        importText: node.getFullText(),
        path: node.moduleSpecifier.getText(),
        wasRelative: isPathRelative(node.moduleSpecifier.getText()),
      })
    }

    // Loop through the root AST nodes of the file
    ts.forEachChild(node, traverseNode)
  }

  traverseNode(sourceFile as ts.Node)

  const imports = transformImportPaths(fileLocation, importObjects)

  return [interfaceObjects, imports]
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
): [InterfaceObject[], InterfaceObject[], Import[]] => {
  const [sourceObjects, sourceImports] = generateObjectsAndImportsForInterfacesInFile(sourceLocation)
  const [targetObjects, targetImports] = generateObjectsAndImportsForInterfacesInFile(targetLocation)

  const uniqueImports = new Set<Import>()

  sourceImports.forEach((item) => {
    uniqueImports.add(item)
  })

  targetImports.forEach((item) => {
    uniqueImports.add(item)
  })

  const uniqueCombinedImports = Array.from(uniqueImports)

  return [sourceObjects, targetObjects, uniqueCombinedImports]
}

export const generateMapper = (
  templateFile: string,
  sources: InterfaceObject[],
  targets: InterfaceObject[],
  imports: Import[],
): string => {
  const mapperObjects = generateMappersForInterfaces(sources, targets)

  const template = hb.compile(templateFile)

  const templateObject: TemplateObject = {
    imports: imports,
    mappers: mapperObjects,
  }

  const mapper = template(templateObject)

  return mapper
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
  const path = findRelativePath(locationOfInterface, locationOfOutputFile)
  const interfaces = interfaceNames.join(', ')

  if (interfaceNames.length > 0) {
    return `import { ${interfaces} } from "${path}"`
  }
}

export const generateMappers = (configForMappingFilesLocation: string, outputFileLocation: string): void => {
  if (!fs.existsSync(configForMappingFilesLocation)) {
    const errorMessage = 'You need to specify a JSON config file with the mapping specification'
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const mappingsFile = fs.readFileSync(configForMappingFilesLocation).toString('utf-8')
  const templateFile = fs.readFileSync(path.resolve(__dirname, 'template.handlebars')).toString('utf-8')

  let configFileEntries: ConfigFileEntriesTuple[]

  try {
    configFileEntries = extractConfigFileEntries(mappingsFile)
  } catch (error: any) {
    console.error(error?.message)
    throw error
  }

  const writer = fs.createWriteStream(outputFileLocation)

  for (const [sourceLocation, targetLocation, viceVersa] of configFileEntries) {
    if (fs.existsSync(sourceLocation) && fs.existsSync(targetLocation)) {
      const [sources, targets, imports] = generateObjectsForSourcesAndTarget(sourceLocation, targetLocation)
      
      let mapperContent = generateMapper(templateFile, sources, targets, imports)

      console.log(`Mapping from source: "${sourceLocation}" to target: "${targetLocation}"`)

      if (viceVersa) {
        const viceVersaContent = generateMapper(templateFile, sources, targets, imports)
        mapperContent = mapperContent + '\n' + viceVersaContent

        console.log(`Mapping from source: "${targetLocation}" to target: "${sourceLocation}"`)
      }

      writer.write(mapperContent)
    }
  }
  writer.close()
}
