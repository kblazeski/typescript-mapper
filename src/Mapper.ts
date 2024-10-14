import fs from 'fs'
import * as hb from 'handlebars'
import * as ts from 'typescript'

// TODO: add structured clone

// const modelFileLocation = './src/model/Organization.ts'
// const viewModelFileLocation = './src/view-model/OrganizationViewModel.ts'

// const outputFile = './src/generated/mapper.ts'

interface PropObject {
  type: string
  hasQuestionMark: boolean
}

interface InterfaceObject {
  name: string
  props: {
    [key: string]: PropObject
  }
}

// Object representation passed to handlebars for generating template
interface MapperObject {
  modelType: string
  viewModelType: string
  customMapOptional: boolean
  autoMapProps: string[]
  customMapProps: {
    propName: string
    returnType: string
    isOptional: boolean
  }[]
}

const config: Map<string, string> = new Map()

export class TypeScriptMapper {
  static addMapping<Source, Target>(sourcePath: string, targetPath: string) {
    config.set(sourcePath, targetPath)
  }
}

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
  modelObjects: InterfaceObject[],
  viewModelObjects: InterfaceObject[],
): MapperObject[] => {
  const mapperObjects: MapperObject[] = []
  modelObjects.forEach((modelObject) => {
    viewModelObjects.forEach((viewModelObject) => {
      const mapperObject: MapperObject = {
        modelType: modelObject.name,
        viewModelType: viewModelObject.name,
        customMapOptional: true,
        autoMapProps: [],
        customMapProps: [],
      }

      const modelObjectProps = modelObject.props
      const viewModelObjectProps = viewModelObject.props

      const viewModelObjectPropsKeys = Object.keys(viewModelObjectProps)

      // auto mapped properties
      const autoMapProps = new Set<string>()
      const customMapProps: MapperObject['customMapProps'] = []

      viewModelObjectPropsKeys.forEach((prop) => {
        const viewModelProp = viewModelObjectProps[prop]
        const modelProp = modelObjectProps[prop]

        const viewModelPropType = viewModelProp.type
        const modelPropType = modelProp?.type

        const viewModelPropTypeWithoutNullableTypes = filterNullableUnionTypes(viewModelPropType)
        const modelPropTypeWithoutNullableTypes = filterNullableUnionTypes(modelPropType)

        const viewModelPropNullable = isTypeNullable(viewModelPropType, viewModelProp.hasQuestionMark)
        const modelPropNullable = isTypeNullable(modelPropType, modelProp?.hasQuestionMark)

        if (prop in modelObjectProps && viewModelPropTypeWithoutNullableTypes === modelPropTypeWithoutNullableTypes) {
          // TODO: refactor this
          // if from is nullable and to expects non nullable -> we add custom value (dont map but expect customMap)
          if (modelPropNullable && !viewModelPropNullable) {
            customMapProps.push({
              propName: prop,
              returnType: getReturnType(viewModelProp),
              isOptional: false,
            })
          } else {
            autoMapProps.add(prop)
            customMapProps.push({ propName: prop, returnType: getReturnType(viewModelProp), isOptional: true })
          }
        } else {
          customMapProps.push({ propName: prop, returnType: getReturnType(viewModelProp), isOptional: false })
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

export const generateMappers = (outputFile: string): void => {
  const templateFile = fs.readFileSync('./src/generated/mapper.handlebars')
  const modelObjects = generateObjectsForInterfacesInFile(typeAFiles)
  const viewModelObjects = generateObjectsForInterfacesInFile(typeBFiles)

  const mappersModelToViewModel = generateMappersForInterfaces(modelObjects, viewModelObjects)

  const template = hb.compile(templateFile.toString('utf-8'))

  fs.writeFileSync(outputFile, template(mappersModelToViewModel))
}
