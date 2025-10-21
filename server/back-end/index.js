const fs = require("fs");
const path = require("path");
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
    function echo() {
      for (let a of arguments) {
        if (typeof a === "object") a = a.stringify(3);
        __output += (a ?? "");
      }
    }
    function puts() {
      __output += arguments[0] + "<br>";
    }
    (async () => {
      ${str}
      return __output;
    })()`) ?? "";
    if (typeof __output === "number") __output = String(__output);
    if (!res.writableEnded && flush) res.send(__output);
  } catch (error) {
    res.end(String(error));
  }
};
Object.defineProperty(Object.prototype, "stringify", {value: function (maxDepth = 0) {
  function show(depth = 0) {
    var _this = this.valueOf?.() || this, type = typeof _this, result = "",
        indentation = "", indentation2 = "", str = "", itemType, 
        objectType = Object.prototype.toString.call(_this).match(/(?<=\[object ).*(?=\])/)[0];
    depth++;
    for (let i = 0; i < depth; i++) {
      indentation += "  "
    }
    indentation2 = indentation.slice(2);
    if (type === "object" && objectType !== "RegExp") {
      if (Array.isArray(_this)) {
        let objectType;
        result += "[\n";
        for (let item of _this) {
          result += indentation;
          itemType = typeof item;
          if (itemType === "object" && item !== null) {
            if (depth < maxDepth) {
              result += show.call(item, depth) + ",\n";
            } else {
              str = Object.prototype.toString.call(item);
              objectType = str.match(/(?<=\[object ).*(?=\])/)[0];
              if (objectType === "RegExp") {
                result += item.toString();
              } else {
                result += str
              }
              result += ",\n";
            }
          } else {
            str = String(item).replaceAll("\n", `\n${indentation}`);
            if (itemType === "string") str = "\"" + str + "\"";
            result += str + ",\n";
          }
        }
        if (result.lastIndexOf(",\n") === result.length - 2) {
          result = result.slice(0, -2);
        }
        result += `\n${indentation2}]`;
      } else {
        result += "{\n";
        for (let i in _this) {
          var item = _this[i];
          result += indentation;
          result += i + ": ";
          itemType = typeof item;
          if (typeof item === "object" && item !== null) {
            if (depth < maxDepth) {
              result += show.call(item, depth) + ",\n";
            } else {
              result += Object.prototype.toString.call(item) + ",\n";
            }
          } else {
            str = String(item).replaceAll("\n", `\n${indentation}`);
            if (itemType === "string") str = "\"" + str + "\"";
            result += str + ",\n";
          }
        }
        if (result.lastIndexOf(",\n") === result.length - 2) {
          result = result.slice(0, -2);
        }
        result += `\n${indentation2}}`;
      }
    } else {
      result = String(_this);
    }
    return result;
  }
  return show.call(this);
}});
class Prom {
  results = [];
  resolves = [];
  resolve(result) {
    if (this.resolves.length) this.resolves.shift()(result);
    else this.results.push(result);
  }
  then(resolve) {
    if (this.results.length) resolve(this.results.shift());
    else this.resolves.push(resolve);  
  }
}