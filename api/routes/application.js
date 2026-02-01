const APP_BASE_URL = 'http://localhost:3000'

function initializeForLocalDev (app) {
  const allowCrossDomain = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', APP_BASE_URL)
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.header('Access-Control-Allow-Headers', '*')
    // intercept OPTIONS method
    if (req.method === 'OPTIONS') {
      res.send(200)
    } else {
      next()
    }
  }
  app.use(allowCrossDomain)

  app.get('/', (req, res) => res.redirect(APP_BASE_URL))
}

module.exports = initializeForLocalDev
