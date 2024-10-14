#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { generateMappers } from 'src/Mapper.js'
import yargs, { Arguments } from 'yargs'
import { hideBin } from 'yargs/helpers'

type ArgvResult = Arguments<{
  mappingFile: string
  output: string
  fontName: string
}>

const argv = yargs(hideBin(process.argv))
  .alias('s', 'mappingFile')
  .describe('s', 'Mapping specification file path.')
  .alias('o', 'output')
  .describe('o', 'Output directory.')
  .demandOption(['mappingFile', 'output'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2024').argv as ArgvResult

const mappingFileSpecPath = path.resolve(process.cwd(), argv.mappingFile)
const outputPath = path.resolve(process.cwd(), argv.output)

if (!fs.existsSync(mappingFileSpecPath)) {
  console.error('You need to specify a json mapping file location')
}

generateMappers(mappingFileSpecPath, outputPath)
