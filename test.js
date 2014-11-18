require('./index.js').createFS(null, {platform:process.platform}, function (err, fs) {
  /*fs.createReadStream(process.argv[2], {
     start:process.argv[3],
     end: process.argv[4]
  }).pipe(process.stdout);*/
  //fs.createWriteStream('test', {start:1, flags:'a'}).end('432');
  fs.writeFile('perms', 'buzzlebub', {flag:'a',mode:666}, function () {
    console.log('DONE', arguments)
  }) 
});
