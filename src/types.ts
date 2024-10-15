type Source = string
type Destination = string
type ViceVersa = boolean | undefined
export type ConfigFileEntriesTuple = [Source, Destination, ViceVersa]

export interface PropObject {
  type: string
  hasQuestionMark: boolean
}

export interface InterfaceObject {
  name: string
  props: {
    [key: string]: PropObject
  }
}

// Object representation passed to handlebars for generating template
export interface MapperObject {
  sourceType: string
  targetType: string
  customMapOptional: boolean
  autoMapProps: string[]
  customMapProps: {
    propName: string
    returnType: string
    isOptional: boolean
  }[]
}
