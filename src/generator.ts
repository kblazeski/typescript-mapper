import fs from 'fs'
import hb from 'handlebars'
import path from 'path'
import { ConfigFileEntriesTuple, InterfaceObject, MapperObject, PropObject } from 'src/types'
import { isArray, isObjectOfTypeSourceTargetLocations } from 'src/utils'
import * as ts from 'typescript'
import { fileURLToPath } from 'url'

const generateObjectsForInterfacesInFile = (fileLocation: string): InterfaceObject[] => {
  const program = ts.createProgram([fileLocation], { allowJs: true, strictNullChecks: true })
  const typeChecker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(fileLocation)

  const interfaceObjects: InterfaceObject[] = []

  // Loop through the root AST nodes of the file
  ts.forEachChild(sourceFile as ts.Node, (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      const interfaceObject: InterfaceObject = {
        name: node.name.text,
        props: {},
      }

      node.members.forEach((prop) => {
        const name = (prop.name as any)?.escapedText
        const type = (prop as any)?.type

        interfaceObject.props[name] = {
          type: typeChecker.typeToString(typeChecker.getTypeAtLocation(type)),
          hasQuestionMark: Boolean(prop.questionToken),
        }
      })

      interfaceObjects.push(interfaceObject)
    }
  })
  return interfaceObjects
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
): [InterfaceObject[], InterfaceObject[]] => {
  const sourceObjects = generateObjectsForInterfacesInFile(sourceLocation)
  const targetObjects = generateObjectsForInterfacesInFile(targetLocation)

  return [sourceObjects, targetObjects]
}

export const generateMapper = (
  templateFile: string,
  sources: InterfaceObject[],
  targets: InterfaceObject[],
): string => {
  const mapperObjects = generateMappersForInterfaces(sources, targets)

  const template = hb.compile(templateFile)

  const mapper = template(mapperObjects)

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
      const [sources, targets] = generateObjectsForSourcesAndTarget(sourceLocation, targetLocation)
      let mapperContent = generateMapper(templateFile, sources, targets)

      console.log(`Mapping from source: "${sourceLocation}" to target: "${targetLocation}"`)

      if (viceVersa) {
        const viceVersaContent = generateMapper(templateFile, targets, sources)
        mapperContent = mapperContent + '\n' + viceVersaContent

        console.log(`Mapping from source: "${targetLocation}" to target: "${sourceLocation}"`)
      }

      writer.write(mapperContent)
    }
  }
  writer.close()
}
