var _queue = require('process-queue').createQueue({concurrency: Infinity});
var concat = require('concat-stream');
var Stats = require('fs').Stats;
var once = require('once');
var createRangeStream = require('./util.js').createRangeStream;

exports.createFS = function createFS(queue, fs_opts, cb) {
  queue = queue || _queue;
  fs_opts = fs_opts || Object.create(null);
  var fs = Object.create(null);
  function push(bin, args, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    queue.push({
      spawnOptions: [bin, args, opts]
    }, cb);
  }
  function pushExec(bin, args, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = null;
    }
    var stdout = null;
    var stderr = null;
    var err = undefined;
    queue.wrap({
      child: function (child, next) {
        stdout = stderr = undefined;
        child.stdout.pipe(concat(function (data) {stdout = data || null;finish()}));
        child.stderr.pipe(concat(function (data) {stderr = data || null;finish()}));
        next(null, child);
      }
    }).push({
      spawnOptions: [bin, args, opts]
    }, function (proc_err) {
      err = proc_err;
      finish();
    });
    function finish() {
      if (stderr === undefined || stdout === undefined || err === undefined) {
        return;
      }
      cb(err, stdout, stderr);
    }
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
    if (fs_opts.platform == 'darwin') {
      pushExec('stat', ['-f', '%d %i %p %l %u %g %r %z %a %m %c %k %b', '--', path], parseStat);
    }
    else {
      pushExec('stat', ['-c', '%d %i %a %h %u %g %d %s %X %Y %Z %o %b', '--', path], parseStat)
    }
    function parseStat(err, stdout, stderr) {
      if (err) {
        cb(err);
      }
      else {
        var mode = new Stats();
        var parts = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(String(stdout));
        mode.dev = parseInt(parts[1], 10);
        mode.mode = parseInt(parts[3], 8);
        mode.nlink = parseInt(parts[4], 10);
        mode.uid = parseInt(parts[5], 10);
        mode.gid = parseInt(parts[6], 10);
        mode.rdev = parseInt(parts[7], 10);
        mode.blksize = parseInt(parts[12], 10);
        mode.ino = parseInt(parts[2], 10);
        mode.size = parseInt(parts[8], 10);
        mode.blocks = parseInt(parts[13], 10);
        mode.atime = new Date(parseInt(parts[9], 10)*1000);
        mode.mtime = new Date(parseInt(parts[10], 10)*1000);
        mode.ctime = new Date(parseInt(parts[11], 10)*1000);

        if (mode.isCharacterDevice() || mode.isBlockDevice()) {
          mode.dev = 0; 
        }
        else {
          mode.rdev = 0; 
        }
        cb(null, mode);
      }
    }
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
    if (fs_opts.platform != 'darwin') {
      if (exclusive) {
        conv.push('excl');
      }
      if (appending) {
        conv.push('append');
        args.push('seek='+start);
      }
      if (options.mode != null) {
        
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
    // indirection so we can chmod 
    var ret = require('through2')(function (c,e,b) {
      b(null, c);
    });
    queue.wrap({
      child: function (child, next) {
        if (options.mode) {
          fs.chmod(path, options.mode, function (err) {
            if (err) ret.destroy(err);
            else startPipe();
          })
        }
        else {
          startPipe();
        }
        function startPipe() {
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
        }
        next(null, child); 
      }
    }).push({
      spawnOptions: [bin, args] 
    }, function (err){
       if (err) ret.destroy(err);
    })
    return ret;
  }
  fs.readFile = function (filename, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
    options = Object.create(options || null);
    delete options.start;
    delete options.end;
    options.flags = options.flag;
    callback = once(callback);

    var stream = concat(function (data) {
      callback(null, data);
    }); 
    fs.createReadStream(filename, options).pipe(stream); 
    stream.on('error', callback);
  }
  fs.writeFile = function (filename, data, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = null;
    }
    options = Object.create(options || null);
    delete options.start;
    delete options.end;
    options.flags = options.flag;
    callback = once(callback);
 
    var stream = fs.createWriteStream(filename, options)
    stream.end(data);
    stream.on('error', callback);
  }
  cb(null, fs);
}
