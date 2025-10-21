var code = req.headers["sse-code"];
var dirpath = req.body.path;
var inode = req.body.inode;
var sse = Storage[code];

if (sse) {
  let file = root[inode], handler = function (type, data) {
    if (type === "edited") {
      sse.write(`event: ${inode}-edited\n` + "data: " + JSON.stringify(data) + "\n\n");
    } else if (type === "saved") {
      sse.write(`event: ${inode}-saved\n` + "data: " + "\n\n");
    } else if (type === "renamed") {
      sse.write(`event: ${inode}-renamed\n` + "data: " + data + "\n\n");
    } else if (type === "retyped") {
      sse.write(`event: ${inode}-retyped\n` + "data: " + data + "\n\n");
    } else if (type === "belonged") {
      sse.write(`event: ${inode}-belonged\n` + "data: " + JSON.stringify(data) + "\n\n");
    } else if (type === "deleted") {
      sse.write(`event: ${inode}-deleted\n` + "data: " + "\n\n");
      onfinish(null, res);
    }
  }, onfinish = function (err, res) {
    file[root.$off](handler);
    sse.finishListeners.delete(onfinish);
  };
  
  sse.write(`event: ${inode}-loaded\n` + "data: " + "\n\n");

  file[root.$on](handler);

  sse.onfinish = onfinish;
} else {
  echo("Failed to setup connection!");
}