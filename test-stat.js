var _fs = require('fs');
var file = 'package.json';
var assert = require('assert');
require('./index.js').createFS(null, {platform:process.platform}, function (err, fs) {
  fs.stat(file, function (err, stat) {
    assert(!err);
    assert.equal(JSON.stringify(stat), JSON.stringify(_fs.statSync(file)))
  });
});


