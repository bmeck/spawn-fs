var through2 = require('through2')

exports.createRangeStream = function (start, end) {
  var index = 0;
  var done = false;
  return through2(function (chunk, enc, cb) {
    if (done) {
      cb(null);
      return;
    }
    var begin = 0;
    var stop = chunk.length;
    if (index + chunk.length < start) {
      cb(null);
      return;
    }
    else {
      begin = index > start ? 0 : start - index;
    } 
    if (index + chunk.length > end) {
      stop = end - index;
      done = true;
    }
    this.push(chunk.slice(begin, stop));
    if (done) this.push(null);
    index += chunk.length;
    cb(null);
  })
}

