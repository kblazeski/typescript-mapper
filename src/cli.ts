#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { generateMappers } from 'src/generator'
import yargs, { Arguments } from 'yargs'
import { hideBin } from 'yargs/helpers'

type ArgvResult = Arguments<{
  config: string
  output: string
}>

const argv = yargs(hideBin(process.argv))
  .alias('c', 'config')
  .describe('c', 'JSON config file specifying which files need to be mapped')
  .alias('o', 'output')
  .describe('o', 'Output file.')
  .demandOption(['config', 'output'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2024').argv as ArgvResult

const configForMappingFilesLocation = path.resolve(process.cwd(), argv.config)
const outputPath = path.resolve(process.cwd(), argv.output)

if (!fs.existsSync(configForMappingFilesLocation)) {
  console.error('You need to specify a json mapping file location')
}

generateMappers(configForMappingFilesLocation, outputPath)
