const fs = require("fs");
const path = require("path");
const util = require("util");
const onFinished = require("on-finished");

for (let fname of fs.readdirSync(__dirname)) require("./" + fname);
module.exports = async function (req, res, str, origin, __filename) {
  var __dirname = path.dirname(__filename);
  res.finishListeners = new Set;
  Object.defineProperty(res, "onfinish", {
    set(value) {
      this.finishListeners.add(value);
    }
  });
  onFinished(res, (err, res) => {
    for (let listener of res.finishListeners) {
      listener(err, res);
    }
  });
  try {
    let __output = "", flush = true;
    __output = await eval(`
    "use strict";
    function print() {
      for (let a of arguments) {
        if (typeof a !== "string") {
          a = util.inspect(a, {
            showHidden: false,
            depth: 2,
            colors: false,
            compact: true
          });
        }
        __output += a;
      }
    }
    (async () => {
      ${str}
      return __output;
    })()`) ?? "";
    if (typeof __output === "number") __output = String(__output);
    if (!res.writableEnded && flush) res.send(__output);
  } catch (error) {
    res.end(util.format(error) + '\n');
  }
};