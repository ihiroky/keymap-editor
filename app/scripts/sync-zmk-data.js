#!/usr/bin/env node
/**
 * ZMK の定義データ (behaviors / behavior-types / keycodes) を、API サービスの
 * データディレクトリからアプリの public/ 配下へコピーする。
 *
 * これにより、ビルド後のアプリは定義データを
 *   <PUBLIC_URL>/zmk-data/*.json
 * として HTTP GET で取得できる（= アプリと同じディレクトリに静的ホストする）
 * ようになる。API サーバー無しでも動作する。
 *
 * 同期元は常に api/services/zmk/data を正とし、生成物はビルド対象の
 * app/public/zmk-data に置く（git 管理外）。`prestart` / `prebuild` から
 * 自動実行されるほか、`npm run sync:zmk-data` で単体実行できる。
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const sourceDir = path.join(repoRoot, 'api', 'services', 'zmk', 'data')
const destDir = path.resolve(__dirname, '..', 'public', 'zmk-data')

// [同期元のファイル名, アプリが取得する静的ファイル名]
const files = [
  ['zmk-behaviors.json', 'behaviors.json'],
  ['zmk-behavior-types.json', 'behavior-types.json'],
  ['zmk-keycodes.json', 'keycodes.json']
]

fs.mkdirSync(destDir, { recursive: true })

for (const [source, dest] of files) {
  const sourcePath = path.join(sourceDir, source)
  if (!fs.existsSync(sourcePath)) {
    console.error(`[sync-zmk-data] 同期元が見つかりません: ${sourcePath}`)
    process.exit(1)
  }

  const destPath = path.join(destDir, dest)
  fs.copyFileSync(sourcePath, destPath)
  console.log(`[sync-zmk-data] ${path.relative(repoRoot, sourcePath)} -> ${path.relative(repoRoot, destPath)}`)
}
