// rollup.config.js
import typescript from '@rollup/plugin-typescript'
import { defineConfig } from 'rollup'

const rollupConfig = defineConfig({
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
    {
      name: 'typescript-mapper',
      file: 'dist/umd/index.js',
      format: 'umd',
    },
  ],
  plugins: [typescript()],
})

export default rollupConfig
