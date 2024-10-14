// rollup.config.js
import typescript from '@rollup/plugin-typescript'
import { defineConfig } from 'rollup'
import copy from 'rollup-plugin-copy'

const rollupConfig = defineConfig([
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/cjs/index.js',
        format: 'cjs',
      },
      {
        file: 'dist/mjs/index.js',
        format: 'es',
      },
    ],
    plugins: [typescript()],
  },
  {
    input: 'src/cli.ts',
    output: [
      {
        file: 'dist/mjs/cli.js',
        format: 'es',
      },
    ],
    plugins: [
      typescript(),
      copy({
        targets: [{ src: 'src/template.handlebars', dest: 'dist/mjs' }],
      }),
    ],
  },
])

export default rollupConfig
