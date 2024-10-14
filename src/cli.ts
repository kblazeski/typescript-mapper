#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { generateMappers } from 'src/Mapper.js'
import yargs, { Arguments } from 'yargs'
import { hideBin } from 'yargs/helpers'

type ArgvResult = Arguments<{
  output: string
  fontName: string
}>

const argv = yargs(hideBin(process.argv))
  .alias('o', 'output')
  .describe('o', 'Output directory.')
  .demandOption(['output'])
  .help('h')
  .alias('h', 'help')
  .epilog('copyright 2024').argv as ArgvResult

const outputPath = path.resolve(process.cwd(), argv.output)

if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath)
}

generateMappers(outputPath)
