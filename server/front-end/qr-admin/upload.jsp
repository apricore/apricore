if (req.method !== "POST") return;
var prom = new Prom, location = req.headers["file-path"];
if (!location) return `No location provided.`;
location = path.join(wwwroot, decodeURIComponent(location));
if (fs.existsSync(location)) {
  prom.resolve(`There alrady exists a file named ${path.basename(location)}.`);
} else {
  function createFolder(location) {
    let dirname = path.dirname(location);
    if (!fs.existsSync(dirname)) {
      createFolder(dirname);
    }
    fs.mkdirSync(location);
  }
  if (!fs.existsSync(path.dirname(location))) 
    createFolder(path.dirname(location));
  let fileStream = fs.createWriteStream(location, {
    flags: 'w'
  });
  fileStream.on('close', function() {
    prom.resolve("1");
  });
  fileStream.on('error', function(error) {
    prom.resolve(String(error));
  });
  req.pipe(fileStream);
}
return prom;