var fpath = req.query.path;

if (fpath) {
  let realpath = path.join(wwwroot, fpath);
      
  if (fs.existsSync(realpath)) {
    if (fs.statSync(realpath).isDirectory()) {
      let zip = new require("adm-zip")(), basename = path.basename(realpath);
      
      zip.addLocalFolder(realpath, basename);
      zip.writeZip(path.resolve(realpath) + ".zip");

      res.on("close", function () {
        fs.unlinkSync(path.resolve(realpath) + ".zip")
      });
      
      try {
        res.download(path.resolve(realpath) + ".zip");
        flush = false;
      } catch (error) {
        res.end();
      }
    } else {
      try {
        res.download(realpath);
        flush = false;
      } catch (error) {
        res.end();
      }
    }
  } else {
    res.end();
  }
} else {
  res.end();
}