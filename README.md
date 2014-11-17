# spawn fs

creates a filesystem api using only child processes. useful for remote machine work. not the most performant for high end IO.

## `exports.createFS(spawnfn, opts, cb(err,fs))`

It is **HIGHLY** recommended you set `opts.platform` since OSX does not ship with standard bins you see in other unices.

```
spawnfs.createFS(spawn, {
  platform: 'darwin'
}, function (err, fs) {
  fs.createWriteStream(...);
})
```
