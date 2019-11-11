const redis = require('redis')
const commands = require('redis-commands').list
const { promisify } = require('util')

const commandsToSkip = ['batch', 'exec', 'multi', 'end']
const syncCommands = ['end']
const asyncCommands = commands.filter(c => !commandsToSkip.includes(c))

module.exports = function createRedis (opts) {
  const client = redis.createClient(opts)
  const clientP = {}

  asyncCommands.forEach(f => {
    if (client[f]) {
      clientP[f] = promisify(client[f]).bind(client)
    }
  })
  syncCommands.forEach(f => {
    clientP[f] = client[f].bind(client)
  })

  clientP.batch = () => {
    const batch = client.batch()
    batch.exec = promisify(passResultErrors(batch.exec.bind(batch)))
    return batch
  }
  clientP.multi = () => {
    const multi = client.multi()
    multi.exec = promisify(passResultErrors(multi.exec.bind(multi)))
    return multi
  }

  return clientP
}

// Redis handles result errors a little funny. If an individual command passed
// to `batch` or `multi` has an error, the `err` callback might be null but the
// result array may contain errors.
// This method changes that behavious to work more like `Promise.all`
function passResultErrors (func) {
  return (...args) => {
    const params = args.slice(0, args.length - 1)
    const callback = args[args.length - 1]

    func(...params, (err, results) => {
      if (err) {
        return callback(err)
      }

      const arrResults = Array.isArray(results) ? results : [results]
      const foundError = arrResults.find(x => x instanceof Error)
      return foundError
        ? callback(foundError, results)
        : callback(null, results)
    })
  }
}
