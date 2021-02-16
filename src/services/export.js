const {Storage} = require('@google-cloud/storage')
const chalk = require('chalk')
const { v4: uuidv4 } = require('uuid')
const Promise = require('bluebird')
const fs = require('fs')
const archiver = require('archiver')

const FILE_QUANTITY = 10000
const CONCURRENT_REQUEST_QUANTITY = 500

class Export {
  constructor() {
    this.storage = new Storage({projectId: process.env.PROJECT_ID})
    this.bucketOrigin = this.storage.bucket(process.env.BUCKET_WITH_FILES)
    this.bucketDestination = this.storage.bucket(process.env.BUCKET_WITH_ZIPS)
    this.files = []
    // /tmp is available when running on Google Application and will be destroyed when connection is closed
    this.folder = 'extracted-files'
    this.localDir = `/tmp/${this.folder}`
    this.localZippedDir = `/tmp/${this.folder}.zip`
  }

  async initializeBucketFiles() {
    try {
      for (let i = FILE_QUANTITY; i--;) {
        const fileName = uuidv4()
        const object = this.bucketOrigin.file(`path/${fileName}`)
        const contents = 'This is the contents of the file.';
        await object.save(contents)
        this.files.push(fileName)
      }
    } catch (e) {
      throw new Error(e)
    }
  }

  getBucketFiles() {
    return Promise.map(this.files, async (fileName) => {
      const filePath = `${this.localDir}/${fileName}`
      const object = this.bucketOrigin.file(`path/${fileName}`)
      const [exists] = await object.exists()
      if (!exists) {
        return
      }
      if (!fs.existsSync(this.localDir)) {
        if (!fs.mkdirSync(this.localDir, { recursive: true })) {
          console.log(chalk.red(`Path ${this.localDir} not created`))
        }
      }
      return object.download({ destination: filePath })
    }, { concurrency: CONCURRENT_REQUEST_QUANTITY }).then(() => {
      console.log(chalk.green.inverse('Transfer complete.'))
    }, (e) => {
      throw new Error(e)
    })
  }

  zipFiles() {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(this.localZippedDir)
      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
      })

      output.on('close', () => {
        console.log(chalk.blue.inverse(archive.pointer() + ' total bytes'))
        console.log(chalk.blue.inverse('Archiver has been finalized and the output file descriptor has closed.'))
        resolve()
      })

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.log(chalk.red('[archive.warning]', err))
        }
        reject(err)
      })

      archive.on('error', (err) => {
        console.log(chalk.red('[archive.error]', err))
        reject(err)
      })

      archive.pipe(output)

      archive.directory(this.localDir, false)
      archive.finalize()
    })
  }

  uploadZip() {
    return new Promise((resolve, reject) => {
      const zipFileName = `${this.folder}.zip`
      const file = this.bucketDestination.file(zipFileName)
      fs.createReadStream(this.localZippedDir)
        .pipe(file.createWriteStream({ metadata: { contentType: 'application/zip' } }))
        .on('error', (err) => {
        return reject(err)
      }).on('finish', () => {
        console.log(chalk.green.inverse(`Zip sent successfully`))
        return resolve()
      })
    })
  }
}

module.exports = Export
