const { marked } = require('marked');
const fs = require("fs");
const path = require("path");
const app = require("express")();
const server = (process.argv[4] === "https") ? require("https").createServer({
  key: fs.readFileSync(path.join(__dirname, "server.key")),
  cert: fs.readFileSync(path.join(__dirname, "server.cert"))
}, app) : require("http").createServer(app);

global.wwwroot = path.resolve(process.argv[2] || "htdocs").replaceAll("\\", "/");
function isBinary(buf) {
  var str = buf.hexSlice(0, Math.min(buf.length, 100));

  for (let i = 0, chars; i < str.length / 2; i++) {
    chars = str.slice(i * 2, i * 2 + 2)
    if (chars[0] < 2) {
      if (chars[0] == 0) {
        if ("a9d".indexOf(chars[1]) === -1) return true;
      } else return true;
    }
  }
  return false;
}

app.use(require("./server"));
app.get("*", (req, res) => {
  var pathname = decodeURIComponent(req.path);
  var location = wwwroot + pathname;
  var arr = location.split("."), ext, buf;
  if (!arr[1]) ext = "";
  else ext = arr.pop().toLowerCase();
  if (pathname === "/") return res.sendFile(location);
  if (fs.existsSync(location)) {
    let stat = fs.statSync(location);
    
    if (stat.isFile()) buf = fs.readFileSync(location);
    else {
      res.sendFile(location);
      return;
    }
  } else {
    res.writeHead(404, {
      "Content-Type": "text/html",
      'Access-Control-Allow-Origin': '*'
    });
    res.end("<h3>404 Not Found</h3>");
    return;
  }
  if (isBinary(buf)) res.sendFile(location);
  else switch (ext) {
    case "html": case "htm": case "css": case "js": case "svg":
    case "xml": case "dtd": case "xsd": case "pdf":
      res.sendFile(location);
    break;
    case "md":
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; padding: 2rem; line-height: 1.6; }
            pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; }
            code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
          </style>
        </head>
        <body>
          ${marked(buf.toString())}
        </body>
        </html>
      `);
    break;
    default:
      res.end(buf.toString());
  }
});

server.headersTimeout = server.requestTimeout = 0;
server.listen(process.argv[3] || 80);