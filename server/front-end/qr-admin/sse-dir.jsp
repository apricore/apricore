var code = req.headers["sse-code"];
var dirpath = req.body.path;
var inode = req.body.inode;
var sse = Storage[code];

if (sse) {
  let qrFolder = root[inode], handler = function (type, data) {
    if (type === "refresh") {
      sse.write(`event: ${inode}-refresh\n` + "data: " + "\n\n");
    } else if (type === "renamed") {
      sse.write(`event: ${inode}-renamed\n` + "data: " + data + "\n\n");
    } else if (type === "owned") {
      sse.write(`event: ${inode}-owned\n` + "data: " + JSON.stringify(data) + "\n\n");
    } else if (type === "belonged") {
      sse.write(`event: ${inode}-belonged\n` + "data: " + JSON.stringify(data) + "\n\n");
    } else if (type === "deleted") {
      sse.write(`event: ${inode}-deleted\n` + "data: " + "\n\n");
      
      onfinish(null, res);
    }
  }, onfinish = function (err, res) {
    qrFolder[root.$off](handler);
    sse.finishListeners.delete(onfinish);
  };

  sse.write(`event: ${inode}-loaded\n` + "data: " + JSON.stringify({name: path.basename(root.path + qrFolder[root.$path])}) + "\n\n");

  qrFolder[root.$on](handler);

  sse.onfinish = onfinish;
} else {
  echo("Failed to setup connection!");
}