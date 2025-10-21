const fs = require("fs");
const path = require("path");
var dest = path.join(__dirname, "server/front-end/_m/__");
var src = path.join(__dirname, "../node_modules/@codemirror");
var paths = fs.readdirSync(src);
var statefile = path.join(__dirname, "server/back-end/_m/__/state/dist/index.js");
for (let dirname of paths) {
  let realpath = path.join(dest, dirname, "dist", "index.js");
  let realpath2 = path.join(src, dirname, "dist", "index.js");
  let contents = fs.readFileSync(realpath2).toString()
    .replace(/@codemirror\/(.+)(?=')/g, "/_m/__/$1/dist/index.js")
    .replace(/@lezer\/(.+)(?=')/g, "/_m/__/node_modules/@lezer/$1/dist/index.js");
  switch (dirname) {
    case "language":
      contents = contents.replace("import { StyleModule } from 'style-mod';", `import { StyleModule } from "/_m/__/node_modules/style-mod/src/style-mod.js";`);
      break;
    case "lint":
    case "search":
      contents = contents.replace("import elt from 'crelt';", `import elt from "/_m/__/node_modules/crelt/index.js";`);
      break;
    case "view":
      contents = contents.replace("import { StyleModule } from 'style-mod';", `import { StyleModule } from "/_m/__/node_modules/style-mod/src/style-mod.js";`)
        .replace("import { keyName, base, shift } from 'w3c-keyname';", `import { keyName, base, shift } from "/_m/__/node_modules/w3c-keyname/index.js";`)
        .replace("import elt from 'crelt';", `import elt from "/_m/__/node_modules/crelt/index.js";`)
      break;
    case "state":
      fs.writeFileSync(statefile, contents
        .replace(/.+\n/, "const findClusterBreak$1 = require('../../node_modules/@marijn/find-cluster-break/src/index.js');\n")
        .replace("export {", "module.exports = {"));
      contents = contents.replace(/@marijn\/(.+)(?=')/g, "/_m/__/node_modules/@marijn/$1/src/index.js");
  }
  fs.writeFileSync(realpath, contents);
}

src = __dirname + "/../codemirror";
(function map(src, dest) {
  if (fs.existsSync(src)) {
    for (let name of fs.readdirSync(dest)) {
      let destpath = path.join(dest, name),
      srcpath = path.join(src, name);
      if (paths.includes(name)) continue;
      if (fs.statSync(destpath).isDirectory()) {
        map(srcpath, destpath);
      } else if (fs.existsSync(srcpath)) {
        let contents = fs.readFileSync(srcpath).toString()
        .replace(/@codemirror\/(.+)(?=')/g, "/_m/__/$1/dist/index.js")
        .replace(/@lezer\/(.+)(?=')/g, "/_m/__/node_modules/@lezer/$1/dist/index.js");
        fs.writeFileSync(destpath, contents);
      }
    }
  }
})(src, dest);
