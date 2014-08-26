var levelup = require('levelup')
  , mapreduce = require('../level-mapreduce')
  , path = require('path')
  , semver = require('semver')
  , db = levelup(path.join(__dirname, 'packagist'), {valueEncoding:'json'})
  , sortby = require('lodash.sortby')
  , csvStream = require('csv-write-stream')
  , merge = require('lodash.merge')
  ;

function map (obj) {
  var packageName = obj.key
    , versions = obj.value.package.versions
    , versionkeys = []
    ;
  for (var key in versions) {
    var pkg = versions[key]
      , version = semver.clean(pkg.version_normalized || key)
      ;
    if (version && version !== '9999999-dev') {
      versionkeys.push(version)
    }
  }
  var topversion = semver.maxSatisfying(versionkeys, '*')
  if (!topversion && versions['dev-master']) {
    topversion = 'dev-master'
  }
  if (!topversion) return []
  var deps = merge(versions[topversion].require || {}, versions[topversion]['require-dev'] || {})
  var _deps = Object.keys(deps).filter(function (k) {return k !== 'php'})
    ;
  if (!_deps.length) return []

  if (_deps) {
    var ret = _deps.map(function (key) { return [key, packageName] })
    return ret
  }
  return []
}

var index = mapreduce(path.join(__dirname, 'packagist-index'), 'deps', map)

// create
// db.createReadStream().pipe(index)

var allmetrics = {}
  , reads = index.createReadStream()
  , csv = csvStream()
  ;
csv.pipe(process.stdout)
reads.on('data', function (d) {
  if (!allmetrics[d.key]) allmetrics[d.key] = 0
  allmetrics[d.key] += 1
})
reads.on('end', function () {
  var arr = sortby(Object.keys(allmetrics)
            .map(function (k) { return [k, allmetrics[k]]}), function (x) {return x[1]})
            .reverse()
  function _get (dep) {
    var key = dep[0]
      , ret = {package: key, deps: dep[1]}
      ;
    db.get(key, function (e, obj) {
      if (e) {
        if (arr.length) _get(arr.shift())
        return
      }
      ret.maintainers = []
      obj.package.maintainers.forEach(function (man) {
        ret.maintainers.push(man.name ) //+ ' <' + man.email + '>')
      })
      ret.maintainers = ret.maintainers.join(', ')
      csv.write(ret)
      if (arr.length) _get(arr.shift())
    })

  }
  _get(arr.shift())
})
