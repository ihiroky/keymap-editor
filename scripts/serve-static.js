#!/usr/bin/env node
/**
 * ビルド済みアプリ (app/build) を、定義データごと静的ホストする簡易サーバー。
 *
 * - GitHub Pages (`https://<user>.github.io/<repo>/`) と同じ構造で公開する。
 *   マウント先はビルド済み index.html から自動判定し、BASE_PATH で上書きできる。
 * - 定義データ (`zmk-data/*.json`) もアプリと同じディレクトリに置かれるため、
 *   ブラウザは HTTP GET でそのまま取得できる。
 *
 * 使い方:
 *   cd app && PUBLIC_URL=/keymap-editor npm run build
 *   npm run serve
 *   # -> http://localhost:8080/keymap-editor/
 *
 * 環境変数:
 *   PORT      待ち受けポート (既定: 8080)
 *   BASE_PATH マウント先。未指定なら index.html から自動判定
 */
const fs = require('fs')
const http = require('http')
const path = require('path')

const PORT = Number(process.env.PORT || 8080)
const BUILD_DIR = path.resolve(__dirname, '..', 'app', 'build')
const INDEX_FILE = path.join(BUILD_DIR, 'index.html')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

function detectBasePath () {
  if (typeof process.env.BASE_PATH === 'string') {
    return process.env.BASE_PATH.replace(/\/+$/, '')
  }

  if (!fs.existsSync(INDEX_FILE)) {
    return ''
  }

  // ビルド済み index.html のアセット参照 (例: src="/keymap-editor/static/...") から
  // PUBLIC_URL 相当のプレフィックスを取り出す。
  const html = fs.readFileSync(INDEX_FILE, 'utf8')
  const match = html.match(/(?:src|href)="([^"]*?)\/static\//)
  if (match) {
    return match[1].replace(/\/+$/, '')
  }

  return ''
}

const basePath = detectBasePath()

function send (res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

function serveFile (res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const type = MIME_TYPES[ext] || 'application/octet-stream'
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => send(res, 500, 'Internal Server Error'))
  res.writeHead(200, { 'Content-Type': type })
  stream.pipe(res)
}

const server = http.createServer((req, res) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch (err) {
    send(res, 400, 'Bad Request')
    return
  }

  if (basePath && pathname === '/') {
    res.writeHead(302, { Location: `${basePath}/` })
    res.end()
    return
  }

  if (basePath) {
    if (pathname === basePath) {
      res.writeHead(302, { Location: `${basePath}/` })
      res.end()
      return
    }
    if (!pathname.startsWith(`${basePath}/`)) {
      send(res, 404, 'Not Found')
      return
    }
    pathname = pathname.slice(basePath.length)
  }

  let relativePath = pathname.replace(/^\/+/, '')
  if (relativePath === '' || relativePath.endsWith('/')) {
    relativePath = path.posix.join(relativePath, 'index.html')
  }

  let filePath = path.join(BUILD_DIR, ...relativePath.split('/'))

  // ディレクトリトラバーサル防止。
  if (!filePath.startsWith(BUILD_DIR + path.sep)) {
    send(res, 403, 'Forbidden')
    return
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }

  // SPA フォールバック: 拡張子の無いパスは index.html を返す。
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = INDEX_FILE
  }

  if (!fs.existsSync(filePath)) {
    send(res, 404, 'Not Found')
    return
  }

  serveFile(res, filePath)
})

if (!fs.existsSync(INDEX_FILE)) {
  console.error(`[serve-static] ビルド済みアプリが見つかりません: ${INDEX_FILE}`)
  console.error('[serve-static] 先に `cd app && PUBLIC_URL=/keymap-editor npm run build` を実行してください。')
  process.exit(1)
}

server.listen(PORT, () => {
  const prefix = basePath || ''
  console.log(`[serve-static] ${BUILD_DIR} を http://localhost:${PORT}${prefix}/ で公開しています`)
})
