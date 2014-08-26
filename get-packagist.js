var request = require('request')
  , getjson = request.defaults({json:true, headers:{'user-agent':'php-analytics-0.0.1'}})
  , levelup = require('levelup')
  , path = require('path')
  , db = levelup(path.join(__dirname, 'packagist'), {valueEncoding:'json'})
  ;

function getallpkgs (cb) {
  getjson('https://packagist.org/packages/list.json', function (e, resp, body) {
    var allpackages = body.packageNames
    if (e) return cb(e)
    if (resp.statusCode !== 200) return cb(new Error('status code not 200, '+resp.statusCode))
    cb(null, body.packageNames)
  })
}

function main (e, pkgs) {
  if (e) throw e
  function _g () {
    if (pkgs.length !== 0) {
      var pkg = pkgs.shift()
      db.get(pkg, function (e, v) {
        if (e) {
          getjson('https://packagist.org/packages/'+pkg+'.json', function (e, resp, body) {
            if (e) throw e
            if (resp.statusCode !== 200) throw new Error('status code not 200, '+resp.statusCode)
            db.put(pkg, body)
            console.log('got', pkg)
            _g()
          })
        } else {
          console.log('already have', pkg)
          _g()
        }
      })
    }
  }
  _g()
  _g()
  _g()
  _g()
  _g()
}

// getallpkgs(main)
// var i = 0
// db.createKeyStream().on('data', function (str) {
//   console.log(str)
//   i += 1
//   console.log(i)
// })

// getjson('https://packagist.org/packages/sylius/sylius.json', function (e, resp, body) {
//   console.log(body.package.versions)
// })
