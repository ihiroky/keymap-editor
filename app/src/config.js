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

export const apiBaseUrl = trimTrailingSlash(env('API_BASE_URL'))
export const appBaseUrl = trimTrailingSlash(env('APP_BASE_URL'))
export const githubAppName = env('GITHUB_APP_NAME')
export const enableGitHub = parseBoolean(env('ENABLE_GITHUB'))
export const enableLocal = parseBoolean(env('ENABLE_LOCAL'))
