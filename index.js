var _queue = require('process-queue').createQueue();
var createRangeStream = require('./util.js').createRangeStream;

exports.createFS = function createFS(queue, opts, cb) {
  queue = queue || _queue;
  opts = opts || Object.create(null);
  var fs = Object.create(null);
  function push(bin, args, opts, cb) {
    queue.push({
      spawnOptions: [bin, args, opts]
    }. cb);
  }
  function pushExec(bin, args, opts, cb) {
    var stdout;
    var stderr;
    queueExec.wrap({
      child: function (child, next) {
        child.stdout.pipe(concat(function (data) {stdout = data;}));
        child.stderr.pipe(concat(function (data) {stderr = data;}));
        next(null, child);
      }
    }).push({
      spawnOptions: [bin, args, opts]
    }, function (err) {
      cb(err, stdout, stderr);
    });
  }
  fs.rename = function (oldPath, newPath, cb) {
    push('mv', ['-f', '--', oldPath, newPath], cb);
  };
  fs.truncate = function (path, len, cb) {
    push('truncate', ['-c', '--', path, len], cb);
  };
  fs.chown = function (path, uid, gid, cb) {
    uid = String(uid);
    gid = String(gid);
    var idstr = '';
    if (uid) {
      idstr += uid;
    }
    if (gid) {
      idstr += ':' + gid;
    }
    push('chown', ['--', idstr, path], cb);
  };
  function idstr(uid, gid) {
    uid = String(uid);
    gid = String(gid);
    var idstr = '';
    if (uid) {
      idstr += uid;
    }
    if (gid) {
      idstr += ':' + gid;
    }
    return idstr;
  }
  fs.chown = function (path, uid, gid, cb) {
    push('chown', ['--', idstr(uid, gid), path], cb);
  };
  fs.lchown = function (path, uid, gid, cb) {
    push('chown', ['-h', '--', idstr(uid, gid), path], cb);
  };
  fs.chmod = function (path, mode, cb) {
    push('chmod', ['--', mode, path], cb);
  };
  fs.lchmod = function (path, mode, cb) {
    push('chmod', ['-h', '--', mode, path], cb);
  };
  // TODO - will need separate parser for bsd and linux
  fs.stat = function (path, cb) {
  };
  fs.link = function (srcpath, dstpath, cb) {
    push('ln', ['--', srcpath, dstpath], cb);
  };
  fs.symlink = function (srcpath, dstpath, cb) {
    push('ln', ['-s', '--', srcpath, dstpath], cb);
  };
  // TODO - parse output
  fs.readlink = function (path, cb) {
    pushExec('readlink', ['--', path], function (err, stdout) {
      cb(err, String(stdout));
    });
  };
  fs.realpath = function (path, cache, cb) {
    pushExec('readlink', ['-m', '--', path], function (err, stdout) {
      cb(err, String(stdout));
    });
  }
  fs.unlink = function (path, cb) {
    push('unlink', [path], cb);
  }
  fs.rmdir = function (path, cb) {
    push('rmdir', ['--', path], cb);
  }
  fs.mkdir = function (path, mode, cb) {
    if (typeof mode === 'function') cb = mode, mode = null;

    push('mkdir', mode == null ? ['--', path] : ['-m', mode, '--', path], cb);
  }
  fs.mkdir = function (path, mode, cb) {
    if (typeof mode === 'function') cb = mode, mode = null;

    push('mkdir', mode == null ? ['--', path] : ['-m', mode, '--', path], cb);
  }
  fs.readdir = function (path, cb) {
    pushExec('ls', ['-a', '--', path], function (err, stdout) {
      if (err) cb(err, null);
      else cb(err, String(stdout).split(/\n/g).filter(function (file) {
        return !/^\.\.?$/.test(file);
      }));
    });
  }
  fs.createReadStream = function (path, options) {
    options = options || Object.create(null);
    var start = +options.start || 0;
    var end = +options.end;
    var start_block = Math.floor(start/512);
    var args = ['if='+path, 'skip='+start_block];
    var end_block;
    if (!isNaN(end)) {
      end_block = Math.ceil(end/512) - start_block;
      args.push('count=' + (end_block - start_block));
    }
    var stream;
    // https://github.com/joyent/node/issues/8740
    var ret = require('through2')(function (c,e,b) {
      b(null, c);
    });
    queue.wrap({
      child: function (child, next) {
        if (!isNaN(end)) {
          var end_block = Math.ceil(end/512) - start_block;
          args.push('count=' + (end_block - start_block));
          stream = createRangeStream(start % 512, end - start + (start % 512));
        }
        else {
          stream = createRangeStream(start % 512, Infinity);
        }
        stream.pipe(ret);
        child.stdout.pipe(stream);
        next(null, child); 
      }
    }).push({
      spawnOptions: ['dd', args] 
    }, function (err){
       if (err) ret.destroy(err);
    })
    return ret;
  }
  fs.createWriteStream = function (path, options) {
    options = options || Object.create(null);
    var bin = 'dd';
    var start = +options.start || 0;
    var args = ['bs=1', 'of='+path];
    var nul = new Buffer(512);
    nul.fill(0);
    var conv = ['notrunc'];
    var exclusive = false;
    if (options.flags == 'wx' || options.flags == 'wx+' || options.flags == 'ax' || options.flags == 'ax+') {
      exclusive = true;
    }
    var appending = false;
    if (options.flags == 'a' || options.flags == 'a+') {
      appending = true;
    }
    if (opts.platform != 'darwin') {
      if (exclusive) {
        conv.push('excl');
      }
      if (appending) {
        conv.push('append');
        args.push('seek='+start);
      }
      if (conv.length) args.push('conv=' + conv.join(','));
    }
    else {
      // Macs are dumb
      if (appending) {
        bin = 'sh';
        args = ['-c', '--',  (exclusive ? '[ ! -f '+ path.replace(/\W/g,'\\$&') + ' ] && ' : '') + 'cat | tee -a -- ' + path];
      }
      else if (conv.length) {
        bin = 'sh';
        args.push('conv=' + conv.join(','));
        args = ['-c', '--',  (exclusive ? '[ ! -f '+ path.replace(/\W/g,'\\$&') + ' ] && ' : '') + 'cat | dd ' + args.join(' ')];
      }
    }
    // https://github.com/joyent/node/issues/8740
    var ret = require('through2')(function (c,e,b) {
      b(null, c);
    });
    queue.wrap({
      child: function (child, next) {
        if (!appending) {
          for (var i = 0; i < start; i+= nul.length) {
            if (i + nul.length > start) {
              child.stdin.write(nul.slice(0, start - i));
            }
            else {
              child.stdin.write(nul);
            }
          }
        }
        ret.pipe(child.stdin);
        next(null, child); 
      }
    }).push({
      spawnOptions: [bin, args] 
    }, function (err){
       if (err) ret.destroy(err);
    })
    console.log(bin,args)
    return ret;
  }
  cb(null, fs);
}
