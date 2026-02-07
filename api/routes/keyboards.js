const { Router } = require('express')
const zmk = require('../services/zmk')

const router = Router()
const debug = false

router.get('/behaviors', (req, res) => res.json(zmk.loadBehaviors()))
router.get('/keycodes', (req, res) => res.json(zmk.loadKeycodes()))
router.get('/layout', (req, res) => res.json({
  layout: zmk.loadLayout(),
  sensors: zmk.loadSensors()
}))
router.get('/keymap', (req, res) => res.json(zmk.loadKeymap()))
router.post('/keymap', (req, res) => {
  const keymap = req.body
  const layout = zmk.loadLayout()
  const generatedKeymap = zmk.generateKeymap(layout, keymap)
  if (debug) {
    console.log('export', JSON.stringify(generatedKeymap.code, null, 2))
    res.send()
  } else {
    zmk.exportKeymap(generatedKeymap, 'flash' in req.query, err => {
      if (err) {
        res.status(500).send(err)
        return
      }

      res.send()
    })
  }
  // exportStdout.stdout.on('data', data => {
  //   for (let sub of subscribers) {
  //     sub.send(data)
  //   }
  // })
})

module.exports = router
