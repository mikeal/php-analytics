var levelup = require('levelup')
  , mapreduce = require('../level-mapreduce')
  , path = require('path')
  , semver = require('semver')
  , fs = require('fs')
  , db = levelup(path.join(__dirname, 'packagist'), {valueEncoding:'json'})
  , sortby = require('lodash.sortby')
  , csvStream = require('csv-write-stream')
  , merge = require('lodash.merge')
  , handlebars = require('handlebars')
  , depsTemplate = handlebars.compile(fs.readFileSync(path.join(__dirname, 'deps.hbs')).toString())
  , peopleTemplate = handlebars.compile(fs.readFileSync(path.join(__dirname, 'people.hbs')).toString())
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

function output () {
  var allmetrics = {}
    , reads = index.createReadStream()
    , csv = csvStream()
    , allmkd = {packages:[]}

    , people = {}
    , peopleCSV = csvStream()
    ;

  csv.pipe(process.stdout)
  peopleCSV.pipe(process.stdout)
  csv.pipe(fs.createWriteStream(path.join(__dirname, 'deps.csv')))
  peopleCSV.pipe(fs.createWriteStream(path.join(__dirname, 'people.csv')))

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
          else finish()
          return
        }
        ret.maintainers = []
        obj.package.maintainers.forEach(function (man) {
          ret.maintainers.push(man.name) //+ ' <' + man.email + '>')
          var name = man.name
          if (!people[name]) people[name] = {pkgs:0, deps:0, name:name, email:man.email}
          people[name].pkgs += 1
          people[name].deps += ret.deps
        })
        ret.maintainers = ret.maintainers.join(', ')
        allmkd.packages.push(
          { pkg: ret.package
          , deps: ret.deps
          , author: obj.package.maintainers.map(function (m) {return m.name})
          })
        csv.write(ret)
        if (arr.length) _get(arr.shift())
        else finish()
      })

      function finish () {
        var vals = sortby(Object.keys(people).map(function (k) {return people[k]}), function (v) {return v.pkgs})

        vals.reverse().forEach(function (v) {
          delete v['email']
          peopleCSV.write(v)
        })
        peopleCSV.end()
        csv.end()

        fs.writeFileSync(path.join(__dirname, 'deps.mkd'), depsTemplate(allmkd))

        fs.writeFileSync(path.join(__dirname, 'people.mkd'), peopleTemplate({people: vals}))
      }

    }
    _get(arr.shift())
  })
}

output()
