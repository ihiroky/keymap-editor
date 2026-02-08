const fs = require('fs')
const path = require('path')
const Module = require('module')
const babel = require('./app/node_modules/@babel/core')
const presetEnv = require('./app/node_modules/@babel/preset-env')

const sharedZmkRoot = path.resolve(__dirname, 'app/src/shared/zmk')
const defaultJsLoader = Module._extensions['.js']

Module._extensions['.js'] = function transpileSharedZmk (module, filename) {
  const isSharedZmk = filename.startsWith(sharedZmkRoot + path.sep)
  if (!isSharedZmk) {
    return defaultJsLoader(module, filename)
  }

  const source = fs.readFileSync(filename, 'utf8')
  const transformed = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[presetEnv, {
      targets: { node: 'current' },
      modules: 'commonjs'
    }]]
  })

  return module._compile(transformed.code, filename)
}

const api = require('./api')
const config = require('./api/config')

api.listen(config.PORT)
console.log('listening on', config.PORT)
