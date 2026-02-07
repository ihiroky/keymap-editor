const APP_BASE_URL = 'http://localhost:3000'

function initializeForLocalDev (app) {
  app.get('/', (req, res) => res.redirect(APP_BASE_URL))
}

module.exports = initializeForLocalDev
