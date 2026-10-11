const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { extractFile } = require('@electron/asar')
const assert = require('node:assert/strict')

exports.default = async function afterPackMacos(context) {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const packagedMetadata = JSON.parse(extractFile(path.join(resourcesPath, 'app.asar'), 'package.json').toString())
  assert.deepEqual(packagedMetadata.dsaReleaseRepository, require('../package.json').dsaReleaseRepository,
    'Packaged app must retain its update repository metadata')
  assert.equal(packagedMetadata.version, context.packager.appInfo.version,
    'Packaged app version must match the release version')
  console.log('Packaged update repository and version metadata verified')

  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  const auditScript = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'scripts',
    'macos-signature-audit.sh',
  )

  execFileSync('bash', [auditScript, 'normalize', appPath], {
    stdio: 'inherit',
  })
}
