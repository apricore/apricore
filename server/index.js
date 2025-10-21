const fs = require("fs");
const path = require("path");
const express = require('express');
const jsp = express.Router();
const JSProcess = require("./back-end");

jsp.use("*", express.json({limit: Infinity}));
jsp.use("*", express.urlencoded({extended: true, limit: Infinity}));
jsp.use("*", function (req, res, next) {
  var origin = __dirname.replaceAll("\\", "/") + "/front-end";
  var location = origin + req.baseUrl;
  if (!fs.existsSync(location)) {
    origin = wwwroot;
    location = origin + req.baseUrl;
  }
  if (fs.existsSync(location)) {
    let stat = fs.statSync(location);
    if (stat.isDirectory()) {
      location = path.join(location, "index.jsp");
      if (fs.existsSync(location)) {
        let buf = fs.readFileSync(location);
        if (!isBinary(buf)) {
          JSProcess(req, res, buf.toString(), origin, location);
        } else next();
      } else next();
    } else if (path.extname(location).toLowerCase() === ".jsp") {
      let buf = fs.readFileSync(location);
      if (!isBinary(buf)) {
        JSProcess(req, res, buf.toString(), origin, location);
      } else next();
    } else next();
  } else next();
});
jsp.use("/", express.static(__dirname + "/front-end", {maxAge: '365d'}));
function isBinary(buf) {
  var str = buf.hexSlice(0, Math.min(buf.length, 100));
  for (let i = 0, chars; i < str.length / 2; i++) {
    chars = str.slice(i * 2, i * 2 + 2)
    if (chars[0] < 2) {
      if (chars[0] == 0) {
        if ("a9d".indexOf(chars[1]) === -1) {
          return true;
        }
      } else {
        return true;
      }
    }
  }
  return false;
}
module.exports = jsp;