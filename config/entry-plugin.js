const path = require('path')
const VirtualModulesPlugin = require('webpack-virtual-modules')

const isCodeFile = file => file.endsWith('.ts') || file.endsWith('.js')
const IGNORED_FOLDERS = ['assets', '.dependencies']

const SCENE_INIT_CONTENT = `
import scene from './.expanse.json'

delete scene.history
delete scene.historyVersion

window.ecs.application.init(scene)
`

const createVirtualEntryPlugin = (options = {}) => {
  const {srcDir} = options
  const virtualModules = new VirtualModulesPlugin()
  const importedFiles = new Set()

  let hasInit = false

  const updateVirtualModules = () => {
    // `app.ts` va primero si existe: es la convención de 8th Wall para el punto de
    // entrada del proyecto.
    const appFiles = Array.from(importedFiles).filter(
      file => file === path.join(srcDir, 'app.js') || file === path.join(srcDir, 'app.ts')
    )
    const otherFiles = Array.from(importedFiles).filter(file => !appFiles.includes(file))

    const imports = [...appFiles, ...otherFiles]
      .map((file) => {
        const relativePath = path.relative(srcDir, file)
        return `import ${JSON.stringify(`./${relativePath.replace(/\\\\/g, '/')}`)}`
      })
      .join('\n')

    virtualModules.writeModule(
      path.join(srcDir, 'entry.js'),
      `${imports}\n${SCENE_INIT_CONTENT}`
    )
  }

  const getCodeFiles = (fs, dir) => {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file)
      try {
        if (fs.lstatSync(fullPath).isDirectory()) {
          if (!IGNORED_FOLDERS.includes(file)) {
            getCodeFiles(fs, fullPath)
          }
        } else if (isCodeFile(fullPath)) {
          importedFiles.add(fullPath)
        }
      } catch (err) {
        // Archivos virtuales: se ignoran.
      }
    }
  }

  return {
    apply: (compiler) => {
      compiler.hooks.beforeCompile.tapAsync('VirtualEntryPlugin', (_, callback) => {
        if (!hasInit) {
          getCodeFiles(compiler.inputFileSystem, srcDir)
          updateVirtualModules()
          hasInit = true
        }
        callback()
      })

      virtualModules.apply(compiler)
    },
  }
}

module.exports = createVirtualEntryPlugin
