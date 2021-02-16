const express = require('express')
const app = express()
const Export = require('./src/services/export')
const chalk = require('chalk')

app.get('/', function (req, res) {
  res.json({message: 'ok'})
})

app.post('/export', function (req, res) {
  const exportService = new Export()
  exportService.initializeBucketFiles().then(() => {
    exportService.getBucketFiles().then(() => {
      exportService.zipFiles().then(() => {
        exportService.uploadZip().then(() => {
          res.json({message: 'ok'})
        })
      })
    })
  }).catch((err) => {
    console.log(chalk.red.inverse(err.message))
    res.status(500).json({message: err.message})
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`)
  console.log('Press Ctrl+C to quit.')
})

// Default response for any other request
app.use(function (req, res) {
  res.status(404);
});
