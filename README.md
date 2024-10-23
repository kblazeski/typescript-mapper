# TypeScript Mapper
A tool used for generating mapping functions between two `typescript` interfaces

## Install
`npm i -D typescript-mapper`

## Usage
Create a json file which specifies the `source` and `target` files of the interfaces which we want to generate mapper functions

For example, for a file `mapping-specification.json`

Inside the structure should look like:
```json
[
  {
    "source": "src/model/Models.ts",
    "target": "src/view-model/ViewModels.ts",
    "viceVersa": true
  },
  {
    "source": "src/model/SecondModel.ts",
    "target": "src/view-model/SecondViewModel.ts",
    "viceVersa": true
  }
]
```
The properties:
* `source` specifies the file path of the interfaces for the source
* `target` specifies the file path of the interfaces for the target
* `viceVersa` boolean field, if set to `true` it will create mappers additionally from `target` to `source`


Create script in your `package.json` file
```json
  "scripts": {
    "generate-mappers": "generate-ts-mappers -c mapping-specification.json -o src/mappers/mappers.ts"
  },
```
CLI Props:
* `-c` specify the location of the json mapping specification
* `-o` specify the location of the output file where the mapper functions will be places **(has to be .ts)**

**Run the script `npm run generate-mappers` to generate file with the mapping functions**



>[!IMPORTANT]
> The mappers generates only for exported `interface`. Currently the typescript `type` is not supported.

