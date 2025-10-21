const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { ChangeSet, Text } = require("@codemirror/state");
const { rebaseUpdates } = require("@codemirror/collab");
const isWin32 = process.platform === "win32";

if (isWin32) {
  let watchTimeout = 0, fileSet = new Set;
  function afterChange() {
    for (filepath of fileSet) {
      let fullpath = path.join(wwwroot, filepath);
      if (fs.existsSync(fullpath)) {
        try {
          let stat = fs.statSync(fullpath, {bigint: true});
          if (stat.isDirectory()) root["d" + stat.ino]?.[root.$refresh]();
          else root["f" + stat.ino]?.[root.$refresh]();
        } catch (error) {
        }
      }
    }
    fileSet.clear();
  }
  fs.watch(wwwroot, { recursive: true }, function (eventType, filename) {
    if (!filename) return;
    if (eventType === "rename") fileSet.add(path.dirname(filename));
    else fileSet.add(filename)
    clearTimeout(watchTimeout);
    watchTimeout = setTimeout(afterChange, 400);
  }).on("error", error => {
    console.log(error);
    process.exit();
  });
  if (typeof Promise.withResolvers !== "function") {
    Object.defineProperty(Promise, "withResolvers", {
      value: function () {
        var res, rej;
        var p = new Promise(function (resolve, reject) {
          res = resolve;
          rej = reject;
        });
        return { promise: p, resolve: res, reject: rej };
      },
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }
}

const recycleSet = new Set;
const CmStates = new Map;
const editorMapper = {
  get(inode) {
    var state = CmStates.get(inode);

    if (!state) {
      let realpath = root.path + root[inode][root.$path];

      state = {
        mtime: fs.statSync(realpath).mtime.valueOf(),
        updates: new Capacity,
        doc: Text.of(fs.readFileSync(realpath).toString().split(/\r\n|\n/))
      };
      CmStates.set(inode, state);
    }

    return state;
  }
};

const audioExtensions = [
  ".3gp", ".aa", ".aax", ".act", ".aiff",
  ".alac", ".amr", ".ape", ".au", ".awb",
  ".dss", ".dvf", ".flac", ".gsm", ".iklax",
  ".ivs", ".m4a", ".m4b", ".mmf", ".movpkg",
  ".mp3", ".mpc", ".msv", ".nmf", ".ogg",
  ".oga", ".mogg", ".opus", ".ra", "cda",
  ".raw", ".rf64", ".sln", ".tta", ".voc",
  ".vox", ".wav", ".wma", ".wv", ".8svx"
],
vedioExtensions = [
  ".webm", ".mkv", ".flv", ".vob", ".ogv",
  ".drc", ".gifv", ".mng", ".avi",
  ".mts", ".m2ts", ".mov", ".qt", ".wmv",
  ".yuv", ".rm", ".rmvb", ".viv", ".asf",
  ".amv", ".mp4", ".m4p", ".m4v", ".mpg",
  ".mp2", ".mpeg", ".mpe", ".mpv", ".m2v",
  ".m4v", ".svi", ".3g2", ".mxf", ".f4b",
  ".rog", ".nsv", ".f4v", ".f4p", ".f4a"
],
imageExtensions = [
  ".jpeg", ".jpg", ".gif", ".png", ".tiff", ".psd",
  ".eps", ".ai", ".indd", ".raw", ".ico"
], 
extensions = {
  ".html": "html", ".htm": "html",
  ".css": "css",
  ".js": "javascript", ".es": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".ts": "javascript", ".jsp": "javascript",
  ".json": "json",
  ".pug": "pug",
  ".md": "markdown",
  ".php": "php",
  ".sql": "sql",
  ".xml": "xml", ".svg": "xml", ".dtd": "xml", ".xsd": "xml",
  ".h": "h",
  ".c": "c",
  ".cpp": "cpp",
  ".py": "python",
  ".java": "java", ".jav": "java",
  ".pdf": "pdf",
  ".zip": "zip",
  ".exe": "exe", ".out": "exe"
};
global.root = {
  constructor(rootpath) {
    this.path = rootpath;
    this.inode = this.getInode("/");
    this[this.inode] = new Folder(null, "", this.inode);
  },
  fileType(filepath) {
    var realpath = this.path + filepath,
    ext = path.extname(filepath).toLowerCase(), 
    type = extensions[ext];
  
    if (type) return type;
    
    if (imageExtensions.includes(ext)) return "image";
    if (audioExtensions.includes(ext)) return "audio";
    if (vedioExtensions.includes(ext)) return "video";
  
    try {
      let buffer = fs.readFileSync(realpath), 
          str = buffer.hexSlice(0, Math.min(buffer.length, 100));
  
      for (let i = 0, chars; i < str.length / 2; i++) {
        chars = str.slice(i * 2, i * 2 + 2)
        if (chars[0] < 2) {
          if (chars[0] == 0) {
            if ("a9d".indexOf(chars[1]) === -1) {
              return "binary";
            }
          } else {
            return "binary";
          }
        }
      }
    } catch (error) {
      return "binary";
    }
  
    return "txt";    
  },
  addFile(dir, name, inode) {
    this[inode] = dir[name] = new File(dir, name, inode);
  },
  addFolder(dir, name, inode) {
    this[inode] = dir[name] = new Folder(dir, name, inode);
  },
  getFItem(fpath) {
    let dir = this[this.inode], fnames = fpath.split("/");

    if (fpath.endsWith("/")) fnames.pop();
    for (let i = 1; i < fnames.length; i++) {
      dir = dir[fnames[i]];
      if (!dir) return null;
    }

    return dir;
  },
  getFItemSafe(fpath) {
    let rtn = this[this.inode], fnames = fpath.split("/");

    if (fpath.endsWith("/")) fnames.pop();
    for (let i = 1; i < fnames.length; i++) {
      let dir = rtn[fnames[i]];

      if (!dir) {
        rtn[root.$refresh]();
        dir = rtn[fnames[i]];
        if (!dir) return null;
      }
      rtn = dir;
    }

    return rtn;
  },
  getInode(fpath) {
    var stat = fs.statSync(this.path + fpath, {bigint: true}),
        inode = (stat.isDirectory() ? "d" : "f") + stat.ino;

    return inode;
  },
  getInodeSafe(fpath) {
    if (fs.existsSync(this.path + fpath)) return this.getInode(fpath);
  },
  readFolder(fpath) {
    return fs.readdirSync(this.path + fpath);
  },
  refresh(fpath) {
    this.getFItemSafe(fpath)?.[root.$refresh]();
  },
  refreshDir(fpath) {
    this.getFItemSafe(path.dirname(fpath) + "/")?.[root.$refresh]();
  },
  readDir(dirpath) {
    var fItem = this.getFItemSafe(dirpath);
    if (fItem && fItem instanceof Folder) return fItem[root.$read]();
    return `The folder with location ${dirpath} does not exist.`;
  },
  rename(name, fpath) {
    var oldPath = this.path + fpath, 
    newPath = path.join(oldPath, "../" + name);

    if (name.toLowerCase() !== path.basename(oldPath).toLowerCase() && fs.existsSync(newPath))
      return `There is already a file or folder with the same name: "${path.basename(newPath)}" in the location.`;

    try {
      fs.renameSync(oldPath, newPath);
      this.refreshDir(newPath);
    } catch (error) {
      return error.toString();
    }
  },
  makeDir(fpath) {
    try {
      fs.mkdirSync(this.path + fpath);
      this.refreshDir(fpath);
    } catch (error) {
      return error.toString();
    }
  },
  createFile(fpath) {
    if (fs.existsSync(this.path + fpath))
      return `There is already a file or folder with the same name: "${path.basename(fpath)}" in the location.`;
  
    try {
      fs.writeFileSync(this.path + fpath, "");
      this.refreshDir(fpath);
    } catch (error) {
      return error.toString();
    }
  },
  compressFiles(fpaths, filepath) {
    var dirname = path.dirname(filepath) + "/",
        fname = path.basename(filepath, path.extname(filepath)),
        dirpath = dirname + fname + ".zip",
        realpath = this.path + dirpath,
        zip = new AdmZip();
  
    try {
      for (let fpath of fpaths) {
        fpath = this.path + fpath;
        if (fs.existsSync(fpath)) {
          if (fs.statSync(fpath).isDirectory())
            zip.addLocalFolder(fpath, path.basename(fpath));
          else zip.addLocalFile(fpath);
        }
      }
      
      if (fs.existsSync(realpath)) fs.unlinkSync(realpath);
      zip.writeZip(realpath);
      this.refresh(dirname);
    } catch (error) {
      return error.toString();
    }
  },
  extractFile(fpath) {
    var dirpath = path.dirname(fpath) + "/", zip = new AdmZip(this.path + fpath);
    
    try { 
      zip.extractAllTo(this.path + dirpath);
      this.refresh(dirpath);
    } catch (error) {
      return error.toString();
    }
  },
  moveFiles(fpaths, dirpath) {
    var errors = [], assignments = [];
    
    for (let fpath of fpaths) {
      let fname = path.basename(fpath),
          destination = this.path + dirpath + fname;
      
      if (!fs.existsSync(destination)) assignments.push(() => {
        try {
          fs.renameSync(this.path + fpath, destination);
        } catch (error) {
          errors.push(error);
        }
      });
      else errors.push(`The destination already has a file named ${fname}.`);
    }
  
    if (!errors.length) for (let assignment of assignments) assignment();
    this.refresh(dirpath);
  
    return errors;
  },
  copydir(dirpath, targetPath) {
    var files = fs.readdirSync(dirpath);
    
    fs.mkdirSync(targetPath);
    for (let fname of files) {
      let fpath = dirpath + "/" + fname, stat = fs.statSync(fpath);
      
      if (stat.isDirectory()) {
        this.copydir(fpath, targetPath + "/" + fname);
      } else {
        fs.copyFileSync(fpath, targetPath + "/" + fname);
      }
    }
  },
  copyFiles(fpaths, dirpath) {
    try {
      for (let fpath of fpaths) {
        let realpath = this.path + fpath;
        let basename = path.basename(fpath);
        let destination = this.path + dirpath + basename;

        if (fs.existsSync(realpath)) {
          if (fs.existsSync(destination)) {
            let extname = path.extname(fpath);
            let filename = extname.length ? basename.slice(0, -extname.length) : basename;
            let count = 1;

            do destination = this.path + dirpath + filename + "-copy" + count++ + extname;
            while (fs.existsSync(destination));
          }

          let stat = fs.statSync(realpath);

          if (stat.isDirectory()) 
            this.copydir(realpath, destination);
          else 
            fs.copyFileSync(realpath, destination);
        }
      }
      this.refresh(dirpath);
    } catch (error) {
      return error.toString();
    }
  },
  deleteFiles(fpaths) {
    var rootpath = this.path, {deletedFiles, errors} = (function self(fpaths) {
      var deletedFiles = [], errors = [];

      for (let fpath of fpaths) {
        let realpath = rootpath + fpath;

        if (fs.existsSync(realpath)) {
          let stat = fs.statSync(realpath);

          if (stat.isDirectory()) {
            let result = self(fs.readdirSync(realpath).map((fname => fpath.replace(/\/*$/, "/") + fname)));

            errors = errors.concat(result.errors);
            try {
              fs.rmdirSync(realpath);
              deletedFiles.push(path.dirname(fpath) + "/");
            } catch (error) {
              deletedFiles = deletedFiles.concat(result.deletedFiles);
              errors.push(error.toString());
            }
          } else {
            try {
              fs.unlinkSync(realpath);
              deletedFiles.push(path.dirname(fpath) + "/");
            } catch (error) {
              errors.push(error.toString());
            }
          }
        } else {
          deletedFiles.push(path.dirname(fpath) + "/");
        }
      }

      return {deletedFiles, errors};
    })(fpaths);

    for (let dirpath of deletedFiles) this.refresh(dirpath);
    for (let fItem of recycleSet) fItem[root.$delete]();
    
    return errors;
  },
  ofPath(pages) {
    for (let page of pages) {
      let file;
      
      if (file = this[page.inode]) page.path = file[root.$path];
    }
  
    return JSON.stringify(pages);
  },
  readFile(inode) {
    var cmState = editorMapper.get(inode);
    
    return JSON.stringify({version: cmState.updates.length, doc: cmState.doc.toString()});
  },
  writeFile(inode, version, updates) {
    let cmState = editorMapper.get(inode);
    let received = updates.map(json => ({
        clientID: json.clientID,
        changes: ChangeSet.fromJSON(json.changes)
    }));
    if (version !== cmState.updates.length)
      received = rebaseUpdates(received, cmState.updates.from(version));
    for (let update of received) {
      cmState.updates.push(update);
      cmState.doc = update.changes.apply(cmState.doc);
    }
    if (received.length) {
      let json = received.map(update => ({
          clientID: update.clientID,
          changes: update.changes.toJSON()
      }));
      this[inode][root.$emit]("edited", json);
    }
  },
  saveFile(inode) {
    let cmState = editorMapper.get(inode), file = this[inode], fpath = file[root.$path];
  
    try {
      fs.writeFileSync(this.path + fpath, cmState.doc.toString());
      cmState.mtime = fs.statSync(this.path + fpath).mtime.valueOf();
      file[root.$emit]("saved");
    } catch (error) {
      return error.toString();
    }
  },
  cleanFile(inode) {
    let file = this[inode];
  
    try {
      file[root.$emit]("saved");
    } catch (error) {
      return error.toString();
    }
  },
  isBinary(buf) {
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
  },
  $on: Symbol("on"),
  $off: Symbol("off"),
  $emit: Symbol("emit"),
  $dir: Symbol("dir"),
  $name: Symbol("name"),
  $inode: Symbol("inode"),
  $path: Symbol("path"),
  $type: Symbol("type"),
  $dirpath: Symbol("dirpath"),
  $refresh: Symbol("refresh"),
  $update: Symbol("update"),
  $rename: Symbol("rename"),
  $delete: Symbol("delete"),
  $read: Symbol("read"),
  $watcher: Symbol("watcher"),
  $timeout: Symbol("timeout"),
  $load: Symbol("load"),
  $loaded: Symbol("loaded")
}
global.Storage = {
  set(value) {
    var code = "$_" + (+new Date).toString(Math.floor(Math.random() * 24 + 12));
    this[code] = value;
    return code;
  },
  remove(code) {
    var item = this[code];
    delete this[code];
    return item;
  },
  clear() {
    for (let code in this) {
      delete this[code];
    }
  }
};
global.QrAdmin = function QrAdmin(req) {
  var action = req.body.action;

  if (action === "read-dir") return root.readDir(req.body.path);
  else if (action === "of-inode") return root.getInodeSafe(req.body.path);
  else if (action === "rename-dir") return root.rename(req.body.name, req.body.path);
  else if (action === "rename-file") return root.rename(req.body.name, req.body.path);
  else if (action === "create-dir") return root.makeDir(req.body.path);
  else if (action === "create-file") return root.createFile(req.body.path);
  else if (action === "compress-file") return root.compressFiles(req.body.paths, req.body.path);
  else if (action === "extract-file") return root.extractFile(req.body.path);
  else if (action === "move-file") return root.moveFiles(req.body.paths, req.body.path).join("\n");
  else if (action === "copy-file") return root.copyFiles(req.body.paths, req.body.path);
  else if (action === "delete-file") return root.deleteFiles(req.body.paths).join("\n");
  else if (action === "of-path") return root.ofPath(req.body.paths)
  else if (action === "read-file") return root.readFile(req.body.inode);
  else if (action === "write-file") return root.writeFile(req.body.inode, req.body.version, req.body.updates);
  else if (action === "save-file") return root.saveFile(req.body.inode);
  else if (action === "clean-file") return root.cleanFile(req.body.inode);
  else return "!nvalid action: " + action;
};
class EventTarget {
  #listeners = {};
  #handlers = new Set;
  [root.$on](type, func) {
    var listeners;
    
    if (typeof type === "function") {
      this.#handlers.add(type);
      return;
    }
    
    listeners = this.#listeners;
    
    if (!listeners[type]) {
      listeners[type] = new Set;
    }
    listeners[type].add(func);
  }
  [root.$off](type, func) {
    var listeners, handlers;
    
    if (typeof type === "function") {
      this.#handlers.delete(type);
      return;
    }
    
    listeners = this.#listeners,
    handlers = listeners[type];

    if (!handlers) return;
    listeners[type].delete(func);
    if (!handlers.size) {
      delete listeners[type];
    }
  }
  [root.$emit](type, ...args) {
    var listeners = this.#listeners,
        handlers = listeners[type];

    for (let handler of this.#handlers) {
      handler(type, ...args);
    }
    
    if (!handlers) return;
    for (let handler of handlers) {
      handler(...args);
    }
  }
}
class File extends EventTarget {
  constructor(dir, name, inode) {
    super();
    this[root.$dir] = dir;
    this[root.$name] = name;
    this[root.$inode] = inode;
    if (this instanceof Folder) this[root.$type] = "directory";
    else this[root.$type] = root.fileType(this[root.$path]);
    dir?.[root.$emit]("owned", {
      location: this[root.$path], 
      inode: this[root.$inode], 
      name: this[root.$name],
      type: this[root.$type]
    });
    this[root.$load]();
  }
  get [root.$path]() {
    var fpath = this[root.$name], dir = this;
    
    while (dir = dir[root.$dir]) {
      fpath = dir[root.$name] + "/" + fpath;
    }
    
    return fpath;
  }
  get [root.$dirpath]() {
    var fpath = "", dir = this;
    
    while (dir = dir[root.$dir]) {
      fpath = dir[root.$name] + "/" + fpath;
    }
    
    return fpath;
  }
  [root.$load]() {
    this[root.$loaded] = true;
    if (isWin32) return;
    this[root.$watcher] = fs.watch(root.path + this[root.$path], (eventType, filename) => {
      clearTimeout(this[root.$timeout]);
      this[root.$timeout] = setTimeout(() => {
        if (fs.existsSync(root.path + this[root.$path])) this[root.$refresh]();
      }, 400);
    });
    // this[root.$watcher].on("error", error => {
    //   this[root.$delete]();
    // });
  }
  [root.$read]() {
    var fpath = this[root.$path], buf = fs.readFileSync(root.path + fpath);

    if (root.$isBinary(buf)) return;
    if (buf.length > 1415926) return;

    return {filepath: fpath, contents: buf.toString().replaceAll("\r\n", "\n")};
  }
  [root.$rename](dir, name) {
    let oldDir = this[root.$dir], oldName = this[root.$name];

    if (oldDir !== dir) {
      if (oldDir[oldName] === this) delete oldDir[oldName];
      if (oldName !== name) {
        this[root.$name] = name;
        this[root.$emit]("renamed", name);
        if (this[root.$type] !== "directory" && this[root.$type] !== "binary") {
          let newType = root.fileType(this[root.$path]);
          if (this[root.$type] !== newType) {
            this[root.$type] = newType;
            this[root.$emit]("retyped", newType);
          }
        }
      }
      this[root.$dir] = dir;
      dir[root.$emit]("owned", {
        location: this[root.$path], 
        inode: this[root.$inode], 
        name: this[root.$name],
        type: this[root.$type]
      });
      this[root.$emit]("belonged", {
        location: dir[root.$path], 
        inode: dir[root.$inode], 
        name: dir[root.$name],
        type: dir[root.$type]
      });
    } else if (oldName !== name) {
      delete dir[oldName];
      this[root.$name] = name;
      this[root.$emit]("renamed", name);
      if (this[root.$type] !== "directory" && this[root.$type] !== "binary") {
        let newType = root.fileType(this[root.$path]);
        if (this[root.$type] !== newType) {
          this[root.$type] = newType;
          this[root.$emit]("retyped", newType);
        }
      }
    }
    dir[name] = this;
    recycleSet.delete(this);
  }
  [root.$refresh]() {
    let cmState = CmStates.get(this[root.$inode]), realpath, mtime;
    
    if (cmState) {
      realpath = root.path + this[root.$path];
      if (!fs.existsSync(realpath)) return CmStates.delete(this[root.$inode]);
      mtime = fs.statSync(realpath).mtime.valueOf();
      if (cmState.mtime !== mtime) {
        let s1 = cmState.doc.toString(), s2 = fs.readFileSync(realpath).toString().replaceAll("\r", ""),
        l1 = s1.length, l2 = s2.length, 
        x = 0, s = "", updates = [], changes;

        cmState.mtime = mtime;
      
        for (let i = 0;; i++) {
          if (i === l1) {
            let str = s2.slice(i);
            
            if (str) {
              if (i === 0) updates.push([[0, ...str.split("\n")]]);
              else updates.push([i, [0, ...str.split("\n")]]);
            }
            s1 += str;
            break;
          } else if (i === l2) {
            updates.push([i, [s1.slice(i).length]]);
            s1 = s1.slice(0, i);
            break;
          } else if (s1[i] !== s2[i]) {
            if (l1 < l2) {
              let str = s2.slice(i, i + (l2 - l1));
              
              updates.push([i, [0, ...str.split("\n")], l1 - i]);
              s1 = s1.slice(0, i) + str + s1.slice(i);
              break;
            } else if (l1 > l2) {
              updates.push([i, [l1 - l2], l2 - i]);
              s1 = s1.slice(0, i) + s1.slice(i + (l1 - l2));
              break;
            } else break;
          }
        }
      
        for (let i = 0; i < l2; i++) {
          let c2 = s2[i];
      
          if (s1[i] === c2) {
            if (s) updates.push([x, [s.length, ...s.split("\n")], l2 - x - s.length]);
            s = "";
          } else {
            if (!s) x = i;
            s += c2;
          }
        }
        
        if (s) updates.push([x, [s.length, ...s.split("\n")]]);
      
        while (changes = updates.shift()) {
          let cmState = editorMapper.get(this[root.$inode]),
          received = [{changes}].map(json => ({
            changes: ChangeSet.fromJSON(json.changes)
          }));
          for (let update of received) {
            cmState.updates.push(update);
            cmState.doc = update.changes.apply(cmState.doc);
          }
          if (received.length) {
            let json = received.map(update => ({
              changes: update.changes.toJSON()
            }));
            this[root.$emit]("edited", json);
          }
        }
      
        this[root.$emit]("saved");
      }
    }
  }
  [root.$delete]() {
    let oldDir = this[root.$dir], oldName = this[root.$name];
    
    if (oldDir[oldName] === this) delete oldDir[oldName];
    delete root[this[root.$inode]];
    CmStates.delete(this[root.$inode]);
    recycleSet.delete(this);
    this[root.$emit]("deleted");
    this[root.$watcher]?.close();
    clearTimeout(this[root.$timeout]);
  }
}
class Folder extends File {
  get [root.$path]() {
    return super[root.$path] + "/";
  }
  [root.$load]() {
    for (let fname of root.readFolder(this[root.$path])) {
      let inode = root.getInodeSafe(this[root.$path] + "/" + fname), 
          fItem = root[inode];

      if (!inode) continue;
      if (fItem) {
        fItem[root.$rename](this, fname);
      } else {
        if (inode[0] === "d") root.addFolder(this, fname, inode);
        else root.addFile(this, fname, inode);
      }
    }
    super[root.$load]();
  }
  [root.$read]() {
    let fileArr = [], folderArr = [], name = this[root.$name];

    if (!this[root.$loaded]) this[root.$load]();
    if (!name) name = path.basename(root.path);
    for (let fname in this) {
      let fItem = this[fname], info = {location: fItem[root.$path], type: fItem[root.$type], name: fname, inode: fItem[root.$inode]};
      if (fItem instanceof Folder) folderArr.push(info);
      else fileArr.push(info);
    }

    return {dirpath: this[root.$path], body: folderArr.concat(fileArr), name};
  }
  [root.$refresh]() {
    var dirpath = this[root.$path], fileSet = new Set(Object.values(this));

    for (let fname of root.readFolder(dirpath)) {
      let inode = root.getInodeSafe(dirpath + "/" + fname), 
          fItem = this[fname], 
          fItem2 = root[inode];

      if (!inode) continue;
      if (fItem2) {
        if (fItem2[root.$dir] === this) {
          fileSet.delete(fItem2);
          if (!fItem) {
            delete this[fItem2[root.$name]];
            fItem2[root.$name] = fname;
            fItem2[root.$emit]("renamed", fname);
            if (fItem2[root.$type] !== "directory" && fItem2[root.$type] !== "binary") {
              let newType = root.fileType(fItem2[root.$path]);
              if (fItem2[root.$type] !== newType) {
                fItem2[root.$type] = newType;
                fItem2[root.$emit]("retyped", newType);
              }
            }
            this[fname] = fItem2;
          }
        } else {
          fItem2[root.$rename](this, fname);
        }
      } else {
        if (inode[0] === "d") root.addFolder(this, fname, inode);
        else root.addFile(this, fname, inode);
      }
    }
    for (let fItem of fileSet) if (fItem[root.$dir] === this) recycleSet.add(fItem);
    setImmediate(() => {
      for (let fItem of recycleSet) fItem[root.$delete]();
      this[root.$emit]("refresh");
    });
  }
  [root.$delete]() {
    for (let fname in this) this[fname][root.$delete]();
    super[root.$delete]();
  }
}
class Capacity {
  from(index) {
    var rtn = [];
    for (let i = index; i < this.length; i++) rtn.push(this[i]);
    return rtn;
  }
  push(value) {
    this[this.length++] = value;
    delete this[this.length - 100]
  }
  length = 0;
}
global.root.constructor(path.resolve(wwwroot).replaceAll("\\", "/"));