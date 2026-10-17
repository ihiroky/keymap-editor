function parseBoolean (val) {
  return val && ['1', 'on', 'yes', 'true'].includes(val.toString().toLowerCase())
}

function env(key) {
  return process.env[key] || process.env[`REACT_APP_${key}`]
}

function trimTrailingSlash(value) {
  if (!value) {
    return value
  }

  return value.replace(/\/+$/, '')
}

// アプリ自身が配信されているディレクトリ (CRA の PUBLIC_URL)。既定はルート。
const publicBaseUrl = trimTrailingSlash(process.env.PUBLIC_URL || '')

export const apiBaseUrl = trimTrailingSlash(env('API_BASE_URL'))
export const appBaseUrl = trimTrailingSlash(env('APP_BASE_URL'))

// behavior / behavior-type / keycode などの定義データの取得元。
// API からではなく、アプリと同じディレクトリに静的ホストした JSON を
// HTTP GET で取得する（= <PUBLIC_URL>/zmk-data/*.json）。
// REACT_APP_DEFINITIONS_BASE_URL を指定すれば別ホストの API にも向けられる。
export const definitionsBaseUrl = trimTrailingSlash(env('DEFINITIONS_BASE_URL')) ||
  `${publicBaseUrl}/zmk-data`

export const githubAppName = env('GITHUB_APP_NAME')
export const enableGitHub = parseBoolean(env('ENABLE_GITHUB'))
export const enableLocal = parseBoolean(env('ENABLE_LOCAL'))
export const enableBrowserFile = parseBoolean(env('ENABLE_BROWSER_FILE'))
