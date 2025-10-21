import { 
  createExtensions,
  EditorView, ViewPlugin,
  languages, oneDark, oneLight,
  ChangeSet, Compartment, EditorState, toggleMinimap,
  collab, getSyncedVersion, receiveUpdates, sendableUpdates
} from "/_m/index.js";

class Queue {
  constructor(callback = () => {}) {
    this.finally = callback;
    callback(this);
  }
  #queue = new Queue.#_queue;
  get result() {return this.#queue.result}
  get error() {return this.#queue.error}
  set result(value) {this.#queue.resolve(value)}
  set error(value) {this.#queue.reject(value)}
  async then(resolve = () => {}, reject = () => {}) {
    try {return resolve(await this.#queue)
        } catch (error) {return reject(error)
                        } finally {this.finally(this)}
  }
  static #_queue = class queue {
    then(resolve, reject) {
      let result = this.results.shift(),
          error = this.errors.shift();
      if (error === queue.empty) {
        this.result = result;
        this.error = null;
        resolve(result);
      } else if (result === queue.empty) {
        this.error = error;
        this.result = null;
        reject(error);
      } else {
        this.resolves.push(resolve);  
        this.rejects.push(reject);
      }
    }
    resolve(result) {
      let resolve = this.resolves.shift();
      this.rejects.shift();
      if (resolve) {
        this.result = result;
        this.error = null;
        resolve(result);
      } else {
        this.results.push(result);
        this.errors.push(queue.empty);
      }
    }
    reject(error) {
      let reject = this.rejects.shift();
      this.resolves.shift();
      if (reject) {
        this.error = error;
        this.result = null;
        reject(error);
      } else {
        this.errors.push(error);
        this.results.push(queue.empty);
      }
    }
    result = null;
    error = null;
    results = [];
    errors = [];
    resolves = [];
    rejects = [];
    static empty = Symbol();
  }
  static syncCall(request) {
    let queue = new this.#_queue;
    queue.resolve(null);
    return async function () {
      await queue;
      return new Promise((resolve, reject) => {
        request(...arguments, resolve, reject);
      }).finally(() => queue.resolve(null));
    }
  }
  static cacheCall(request) {
    let map = new WeakMap,
        wrapper = key => {
          let result = map.get(key);
          if (result) return Promise.resolve(result);
          else return new Promise((resolve, reject) => {
            request(key, resolve, reject);
          }).then(result => {
            map.set(key, result);
            return result;
          });
        };
    wrapper.map = map;
    return wrapper;
  }
  static wait = this.syncCall((time, resolve) => setTimeout(() => resolve(), time));
}
class Sse {
  constructor(src, messages = {}) {
    const xhttp = new XMLHttpRequest;

    if (Sse.onconnects) {
      Sse.onconnects.add(() => {
        xhttp.open("POST", src);
        xhttp.setRequestHeader("content-type", "application/json");
        xhttp.setRequestHeader("sse-code", Sse.#code);
        xhttp.send(JSON.stringify(messages));
      });

      return Sse.#sse;
    }
    xhttp.open("POST", src);
    xhttp.setRequestHeader("content-type", "application/json");
    xhttp.setRequestHeader("sse-code", Sse.#code);
    xhttp.send(JSON.stringify(messages));

    return Sse.#sse;
  }
  static get sse() {
    return this.#sse;
  }
  static #sse = (() => {
    var sse = new EventSource("sse-ping.jsp");

    sse.addEventListener("connected", message => {
      this.#code = message.data;
      if (this.onconnects) {
        for (let listener of this.onconnects) listener();
        delete this.onconnects;
      } else for (let item of sideNav.querySelectorAll("qr-folder, qr-file")) item.connect();
    });

    return sse;
  })();
  static #xhttp = new XMLHttpRequest;
  static send = Queue.syncCall((src, messages, resolve, reject) => {
    var xhttp = this.#xhttp;

    xhttp.open("POST", src);
    xhttp.setRequestHeader("content-type", "application/json");
    xhttp.onload = () => {
      if (xhttp.status === 200) resolve(xhttp.response)
      else reject(xhttp.status + " " + xhttp.statusText);   
    };
    xhttp.onerror = error => {
      reject(error);
    };
    xhttp.ontimeout = () => {
      reject("timeout");
    };
    xhttp.send(JSON.stringify(messages));
  });
  static fetch(src, messages) {
    return fetch(src, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages), 
    }).then(response => response.json());
  }
  static #code;
  static onconnects = new Set;
}
function create(tagName, attributes, callback) {
  let elem = document.createElement(tagName);
  for (let attribute in attributes)
    elem.setAttribute(attribute, attributes[attribute]);
  callback?.(elem);
  return elem;
}
class qrFolder extends HTMLElement {
  connectedCallback() {
    if (this.classList.contains("collect")) {
      this.classList.remove("copy");
      this.classList.remove("cut");
      this.classList.remove("collect");
    }

    if (this.rendered) return;

    this.addEventListener("focusin", qrFolder.focusinSlot);
    this.addEventListener("focusout", qrFolder.focusoutSlot);

    this.classList.add("loading");
    this.append(this.head);
    this.rendered = true;
    this.dispatchEvent(new CustomEvent("render"));
  }
  rendered = false;
  loaded = false;
  initiated = false;
  setted = false;
  opened = false;
  head = create("div", {class: "dir-head", tabindex: "-1"}, dirHead => {
    dirHead.addEventListener("keydown", qrFolder.keydownSlot);
    dirHead.addEventListener("blur", qrFolder.blurSlot);
  });
  body = create("div", {class: "dir-body"}, dirBody => {
    dirBody.addEventListener("transitionend", qrFolder.transitionEndSlot);
  });
  setup() {
    Sse.fetch("sse-send.jsp", {
      action: "read-dir",
      path: this.path
    }).then(response => {
      for (let {name, inode, type} of response.body) {
        if (type === "directory") {
          let folder = sideNav.querySelector(`qr-folder[inode="${inode}"]`);

          if (folder) this.body.append(folder);
          else create("qr-folder", {name, inode}, folder => {
            folder.head.innerText = name;
            folder.addEventListener("render", () => {
              folder.connect();
            }, {once: true});

            this.body.append(folder);
          });
        } else {
          let file = sideNav.querySelector(`qr-file[inode="${inode}"]`);

          if (file) this.body.append(file);
          else create("qr-file", {name, type, inode}, file => {
            file.head.innerText = name;
            file.addEventListener("render", () => {
              file.connect();
            }, {once: true});

            this.body.append(file);
          });
        }
      }
      Sse.sse.addEventListener(`${this.inode}-owned`, qrFolder.ownedSlot);
      this.rearrange();
      this.setted = true;
      this.dispatchEvent(new CustomEvent("setup"));
    }).catch(error => {
      dialog.alert(`<span style='color: red'>Error reading folder (path = ${this.path}):</span>`, error);
    });
  }
  connect() {
    new Sse("sse-dir.jsp", {path: this.path, inode: this.inode});
    if (this.loaded) return;
    Sse.sse.addEventListener(`${this.inode}-loaded`, qrFolder.loadedSlot, {once: true});
    Sse.sse.addEventListener(`${this.inode}-deleted`, qrFolder.deletedSlot, {once: true});
    Sse.sse.addEventListener(`${this.inode}-renamed`, qrFolder.renamedSlot);
    Sse.sse.addEventListener(`${this.inode}-refresh`, qrFolder.refreshSlot);
    Sse.sse.addEventListener(`${this.inode}-belonged`, qrFolder.belongedSlot);
  }
  refresh() {
    this.classList.add("loading");
    Sse.fetch("sse-send.jsp", {
      action: "read-dir",
      path: this.path
    }).then(response => {
      var data, paths, fileToRemove = {};

      for (let fItem of this.body.children) fileToRemove[fItem.inode] = fItem;

      for (let {name, inode, type} of response.body) {
        if (type === "directory") {
          let folder = sideNav.querySelector(`qr-folder[inode="${inode}"]`);

          if (folder) {
            if (!fileToRemove[folder.inode]) this.body.append(folder);
            else delete fileToRemove[folder.inode];
          } else create("qr-folder", {name, inode}, folder => {
            folder.head.innerText = name;
            folder.addEventListener("render", () => {
              if (sideNav.querySelector(`qr-folder[inode="${inode}"]`)) folder.remove();
              else folder.connect();
            }, {once: true});

            this.body.append(folder);
          });
        } else {
          let file = sideNav.querySelector(`qr-file[inode="${inode}"]`);

          if (file) {
            if (!fileToRemove[file.inode]) this.body.append(file);
            else delete fileToRemove[file.inode];
          } else create("qr-file", {name, type, inode}, file => {
            file.head.innerText = name;
            file.addEventListener("render", () => {
              if (sideNav.querySelector(`qr-file[inode="${inode}"]`)) file.remove();
              else file.connect();
            }, {once: true});

            this.body.append(file);
          });
        }
      }
      this.rearrange();
      rootFolder.body.updateScroll();

      paths = Object.keys(fileToRemove);

      if (paths.length) Sse.fetch("sse-send.jsp", {
        action: "of-path",
        paths: paths.map(inode => ({inode}))
      }).then(response => {
        var dirs = new Set, paths = [];

        for (let fileInfo of response) {
          if (!fileInfo.path) {
            fileToRemove[fileInfo.inode].delete();
          } else {
            let path = fileInfo.path;

            if (path.endsWith("/")) path = path.slice(0, -1);
            dirs.add(path.slice(0, path.lastIndexOf("/") + 1));
            paths.push(path);
          }
        }
        for (let dir of dirs) qrFolder.findByPath(dir).then(result => result?.refresh());
        for (let path of paths) qrFolder.findByPath(path).then(result => {
          if (result?.classList.contains("select")) result.select();
          rootFolder.body.updateScroll();
        })
      });
    }).catch(error => {
      dialog.alert(`<span style='color: red'>Error reading folder (path = ${this.path}):</span>`, error);
    }).finally(() => {
      this.classList.remove("loading");
    });
  }
  delete() {
    for (let child of this.body.children) child.delete();
    Sse.sse.removeEventListener(`${this.inode}-owned`, qrFolder.ownedSlot);
    Sse.sse.removeEventListener(`${this.inode}-renamed`, qrFolder.renamedSlot);
    Sse.sse.removeEventListener(`${this.inode}-refresh`, qrFolder.refreshSlot);
    Sse.sse.removeEventListener(`${this.inode}-belonged`, qrFolder.belongedSlot);
    this.remove();
    rootFolder.body.updateScroll();
  }
  static loadedSlot(message) {
    var data = JSON.parse(message.data),
        _this = qrFolder.getThis(message.type);

    _this.head.innerText = data.name;
    _this.name = data.name;

    _this.head.addEventListener("pointerdown", qrFolder.pointerDownSlot);
    _this.head.addEventListener("click", qrFolder.clickSlot);
    if (CHROMIUM) _this.classList.remove("loading")
    else requestAnimationFrame(() => _this.classList.remove("loading"));
    _this.loaded = true;
    _this.dispatchEvent(new CustomEvent("load"));
  }
  static renamedSlot(message) {
    var data = message.data,
        _this = qrFolder.getThis(message.type);

    _this.name = data;
    _this.head.innerText = data;
    _this.parentNode.parentNode.rearrange();
  }
  static ownedSlot(message) {
    var data = JSON.parse(message.data), {location, name, inode, type} = data,
        _this = qrFolder.getThis(message.type);
        
    if (type === "directory") {
      let folder = _this.subDirOf(name);

      if (folder && !folder.inode) {
        folder.inode = inode;
        folder.head.focus();
        folder.scrollToView();
        _this.rearrange();
        folder.connect();
      } else {
        folder = sideNav.querySelector(`qr-folder[inode="${inode}"]`);

        if (!folder) create("qr-folder", {name, inode}, folder => {
          folder.head.innerText = name;
          folder.addEventListener("render", () => {
            folder.connect();
          }, {once: true});

          _this.body.prepend(folder);
          _this.rearrange();
          rootFolder.body.updateScroll();
        });
      }
    } else {
      let file = _this.fileOf(name);

      if (file && !file.inode) {
        file.inode = inode;
        file.type = type;
        file.connect();
        _this.rearrange();
        file.select();
      } else {
        file = sideNav.querySelector(`qr-file[inode="${inode}"]`);

        if (!file) create("qr-file", {name, type, inode}, file => {
          file.head.innerText = name;
          file.addEventListener("render", () => {
            file.connect();
          }, {once: true});

          _this.body.append(file);
          _this.rearrange();
          rootFolder.body.updateScroll();
        });
      }
    }
  }
  static belongedSlot(message) {
    var data = JSON.parse(message.data), {location, name, inode, type} = data,
        folder = sideNav.querySelector(`qr-folder[inode="${inode}"]`),
        _this = qrFolder.getThis(message.type);

    if (folder?.setted) {
      folder.body.prepend(_this);
      folder.rearrange();
      if (_this.classList.contains("select")) _this.select();
      rootFolder.body.updateScroll();
    } else {
      qrFolder.findByPath(location + _this.name + "/").then(result => {
        if (result?.classList.contains("select")) result.select();
        rootFolder.body.updateScroll();
      });
    }
    folder.querySelectorAll(`qr-file[inode]`).forEach(file => file.dispatchEvent(new CustomEvent("moved")));
  }
  static deletedSlot(message) {
    qrFolder.getThis(message.type).delete();
  }
  static refreshSlot(message) {
    qrFolder.getThis(message.type).refresh();
  }
  static getThis(eventType) {
    return sideNav.querySelector(`qr-folder[inode="${eventType.slice(0, eventType.indexOf("-"))}"]`);
  }
  static async findByPath(path) {
    var fnames = path.split("/"),
        basename = fnames.pop(),
        target = rootFolder,
        queue = new Queue;

    for (let i = 1; i < fnames.length; i++) {
      let fname = fnames[i], folder = target;

      if (!folder.rendered) {
        folder.addEventListener("render", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }
      if (!folder.loaded) {
        folder.addEventListener("load", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }
      if (!folder.initiated) {
        folder.append(folder.body);
        folder.setup();
        folder.initiated = true;
        folder.addEventListener("setup", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      } else if (!folder.setted) {
        folder.addEventListener("setup", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }

      target = folder.subDirOf(fname);
      if (!target) break;
    }

    if (target && basename) {
      let folder = target;
      if (!folder.rendered) {
        folder.addEventListener("render", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }
      if (!target.loaded) {
        folder.addEventListener("load", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }
      if (!folder.initiated) {
        folder.append(folder.body);
        folder.setup();
        folder.initiated = true;
        folder.addEventListener("setup", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      } else if (!folder.setted) {
        folder.addEventListener("setup", () => {
          queue.result = null;
        }, {once: true});
        await queue;
      }
      target = folder.fileOf(basename);
    }

    queue.result = target;

    return queue;
  }
  open() {
    if (this.opened) return;
    setTimeout(() => {
      this.classList.add("open");
    });
    if (this.body.scrollHeight)
      this.body.style.height = this.body.scrollHeight + "px";
    this.opened = true;
  }
  close() {
    if (!this.opened) return;
    setTimeout(() => {
      if (this.body.scrollHeight)
        this.body.style.height = "0";
      this.classList.remove("open");
    });
    if (this.body.scrollHeight)
      this.body.style.height = this.body.scrollHeight + "px";
    this.opened = false;
  }
  select() {
    var selected = sideNav.querySelector(".select"), parent = this;

    if (this === rootFolder) return;

    sideNav.querySelector(".cwd")?.classList.remove("cwd");
    if (this.opened) this.classList.add("cwd");
    else this.parentNode.parentNode.classList.add("cwd");

    selected?.classList.remove("select");
    this.classList.add("select");

    for (let collected of sideNav.querySelectorAll(".collect:not(.copy, .cut)"))
      collected.classList.remove("collect");
    while (sideNav.contains(parent = parent.parentNode.parentNode)) {
      let folder = parent;
      if (folder.opened) continue;
      folder.open();
    }
    this.scrollToView();
  }
  scrollToView() {
    setTimeout(() => {
      var {top, bottom} = this.head.getBoundingClientRect();

      rootFolder.body.style.scrollBehavior = "smooth";
      if (top < rootFolder.offsetTop + rootFolder.body.offsetTop) this.head.scrollIntoView();
      else if (bottom > innerHeight - 24) this.head.scrollIntoView(false);
      rootFolder.body.style.scrollBehavior = "";
    });
  }
  collect() {
    var collected;

    if (this === rootFolder) return;
    collected = this.closest(".collect")
    sideNav.querySelector(".select")?.classList.remove("select");
    sideNav.querySelector(".cwd")?.classList.remove("cwd");
    if (!collected || this.matches(".collect:not(.copy, .cut)")) {
      if (this.classList.toggle("collect")) {
        for (let collected of this.querySelectorAll(".collect")) {
          collected.classList.remove("collect");
          collected.classList.remove("copy");
          collected.classList.remove("cut");
        }
      }
    }
    this.parentNode.parentNode.classList.add("cwd");
  }
  rearrange() {
    var children = this.body.children, folders = [...children].filter(function (folder) {
      return folder.tagName === "QR-FOLDER";
    }).sort(function (a, b) {
      var name1 = +a.name, name2 = +b.name;

      if (name1 && name2) return (name1 < name2) ? -1 : 1;
      return (a.name < b.name) ? -1 : 1;
    }), files = [...children].slice(folders.length).sort(function (a, b) {
      var name1 = +a.name, name2 = +b.name;

      if (name1 && name2) return (name1 < name2) ? -1 : 1;
      return (a.name < b.name) ? -1 : 1;
    })

    for (let i = 0; i < folders.length; i++) {
      if (children[i] !== folders[i]) children[i].before(folders[i]);
    }
    for (let i = folders.length; i < children.length; i++) {
      if (children[i] !== files[i - folders.length]) children[i].before(files[i - folders.length]);
    }
  }
  subDirOf(name) {
    for (let child of this.body.children) {
      if (child.tagName === "QR-FILE") return undefined;
      if (child.name === name) return child;
    }
  }
  fileOf(name) {
    for (let child of this.body.children) {
      if (child.tagName === "QR-FOLDER") continue;
      if (child.name === name) return child;
    }
  }
  get name() {
    return this.getAttribute("name");
  }
  set name(value) {
    this.setAttribute("name", value);
  }
  get inode() {
    return this.getAttribute("inode");
  }
  set inode(value) {
    this.setAttribute("inode", value);
  }
  get path() {
    var folder = this,
        path = "/";

    while (rootFolder.body.contains(folder)) {
      path = "/" + folder.name + path;
      folder = folder.parentNode.parentNode;
    }
    return path;
  }
  static keydownSlot(event) {
    var key = event.key;

    if ("\\/:*?\"<>|".indexOf(key) !== -1) event.preventDefault();
    else if (key === "Enter") {
      event.preventDefault();
      this.blur();
    }
  }
  static focusinSlot(event) {
    event.stopPropagation();
    this.classList.add("focus");
  }
  static pointerDownSlot(event) {
    sideNav.contextMenu.dismiss();
  }
  static clickSlot(event) {
    var folder = this.parentNode;

    if (folder.matches(".rename, .create")) return;
    if (event.ctrlKey) {
      folder.collect();
      return;
    }
    if (!folder.initiated) {
      folder.append(folder.body);
      folder.setup();
      folder.initiated = true;
      folder.addEventListener("setup", () => {
        folder.open();
        folder.select();
      }, {once: true});
      return;
    } else if (!folder.setted) return;
    if (folder.opened) {
      folder.close();
    } else {
      folder.open();
    }
    folder.select();
  }
  static blurSlot(event) {
    var folder = this.parentNode;

    if (folder.classList.contains("rename")) {
      var newName = this.innerText.trim();

      folder.classList.remove("rename");
      this.removeAttribute("contenteditable");
      this.scrollLeft = 0;
      if (!newName || folder.name === newName) {
        this.innerText = folder.name;
        return;
      }
      this.innerText = newName;
      folder.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "rename-dir",
        name: newName,
        path: folder.path
      }).then(error => {
        if (error) throw error;
        else folder.name = newName;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error renaming folder (path = ${folder.path}):</span>`, error);
        this.innerText = folder.name;
      }).finally(() => {
        folder.classList.remove("loading");
      });
    } else if (folder.classList.contains("create")) {
      var name = this.innerText.trim(), parent = folder.parentNode.parentNode;

      folder.classList.remove("create");
      this.removeAttribute("contenteditable");
      this.scrollLeft = 0;
      if (!name) {
        folder.remove();
        rootFolder.body.updateScroll();
        return;
      }
      folder.name = name;
      parent.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "create-dir",
        path: folder.path
      }).then(error => {
        if (error) throw error;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error creating folder (path = ${folder.path}):</span>`, error);
        folder.remove();
        rootFolder.body.updateScroll();
      }).finally(() => {
        parent.classList.remove("loading");
      });
    }
  }
  static focusoutSlot(event) {
    event.stopPropagation();
    this.classList.remove("focus");
    sideNav.contextMenu.dismiss();
  }
  static transitionEndSlot(event) {
    event.stopPropagation();
    if (event.propertyName === "height")
      this.style.height = "";
  }
}
class qrFile extends HTMLElement {
  connectedCallback() {
    if (this.classList.contains("collect")) {
      this.classList.remove("copy");
      this.classList.remove("cut");
      this.classList.remove("collect");
    }

    if (this.rendered) return;

    this.classList.add("loading");
    this.append(this.head);
    this.rendered = true;
    this.dispatchEvent(new CustomEvent("render"));
  }
  rendered = false;
  loaded = false;
  head = create("div", {class: "file-head", tabindex: "-1"}, fileHead => {
    fileHead.addEventListener("click", qrFile.clickSlot);
    fileHead.addEventListener("keydown", qrFile.keydownSlot);
    fileHead.addEventListener("blur", qrFile.blurSlot);
  });
  connect() {
    new Sse("sse-file.jsp", {path: this.path, inode: this.inode});
    if (this.loaded) return;
    Sse.sse.addEventListener(`${this.inode}-loaded`, qrFile.loadedSlot, {once: true});
    Sse.sse.addEventListener(`${this.inode}-deleted`, qrFile.deletedSlot, {once: true});
    Sse.sse.addEventListener(`${this.inode}-renamed`, qrFile.renamedSlot);
    Sse.sse.addEventListener(`${this.inode}-retyped`, qrFile.retypedSlot);
    Sse.sse.addEventListener(`${this.inode}-belonged`, qrFile.belongedSlot);
  }
  delete() {
    Sse.sse.removeEventListener(`${this.inode}-renamed`, qrFile.renamedSlot);
    Sse.sse.removeEventListener(`${this.inode}-retyped`, qrFile.retypedSlot);
    Sse.sse.removeEventListener(`${this.inode}-belonged`, qrFile.belongedSlot);
    this.remove();
    this.dispatchEvent(new CustomEvent("deleted"));
    rootFolder.body.updateScroll();
  }
  static loadedSlot(message) {
    var _this = qrFile.getThis(message.type);

    if (CHROMIUM) _this.classList.remove("loading")
    else requestAnimationFrame(() => _this.classList.remove("loading"));
    _this.loaded = true;
    _this.dispatchEvent(new CustomEvent("load"));
  }
  static renamedSlot(message) {
    var data = message.data,
        _this = qrFile.getThis(message.type);

    _this.name = data;
    _this.head.innerText = data;
    _this.parentNode.parentNode.rearrange();
    _this.dispatchEvent(new CustomEvent("renamed"));
  }
  static retypedSlot(message) {
    var data = message.data,
        _this = qrFile.getThis(message.type);

    _this.type = data;
    _this.dispatchEvent(new CustomEvent("retyped"))
  }
  static belongedSlot(message) {
    var data = JSON.parse(message.data), {location, name, inode, type} = data,
        folder = sideNav.querySelector(`qr-folder[inode="${inode}"]`),
        _this = qrFile.getThis(message.type);

    if (folder?.setted) {
      folder.body.append(_this);
      folder.rearrange();
      if (_this.classList.contains("select")) _this.select(true);
      _this.dispatchEvent(new CustomEvent("moved"));
      rootFolder.body.updateScroll();
    } else {
      qrFolder.findByPath(location + _this.name).then(result => {
        if (result?.classList.contains("select")) result.select(true);
        _this.dispatchEvent(new CustomEvent("moved"));
        rootFolder.body.updateScroll();
      });
    }
  }
  static deletedSlot(message) {
    qrFile.getThis(message.type).delete();
  }
  static getThis(eventType) {
    return sideNav.querySelector(`qr-file[inode="${eventType.slice(0, eventType.indexOf("-"))}"]`);
  }
  select(passive) {
    var selected = sideNav.querySelector(".select"), parent = this;

    sideNav.querySelector(".cwd")?.classList.remove("cwd");
    this.parentNode.parentNode.classList.add("cwd");

    selected?.classList.remove("select");
    this.classList.add("select");
    if (!passive) sideNav.dispatchEvent(new CustomEvent("fileselect", {
      detail: this
    }));

    for (let collected of sideNav.querySelectorAll(".collect:not(.copy, .cut)"))
      collected.classList.remove("collect");
    while (sideNav.contains(parent = parent.parentNode.parentNode)) {
      if (parent.opened) continue;
      parent.open();
    }
    this.scrollToView();
  }
  scrollToView() {
    setTimeout(() => {
      var {top, bottom} = this.head.getBoundingClientRect();

      rootFolder.body.style.scrollBehavior = "smooth";
      if (top < rootFolder.offsetTop + rootFolder.body.offsetTop) this.head.scrollIntoView();
      else if (bottom > innerHeight - 24) this.head.scrollIntoView(false);
      rootFolder.body.style.scrollBehavior = "";
    });
  }
  collect() {
    var collected = this.closest(".collect")

    sideNav.querySelector(".select")?.classList.remove("select");
    sideNav.querySelector(".cwd")?.classList.remove("cwd");
    if (!collected || this.matches(".collect:not(.copy, .cut)"))
      this.classList.toggle("collect");
    this.parentNode.parentNode.classList.add("cwd");
  }
  get name() {
    return this.getAttribute("name");
  }
  set name(value) {
    this.setAttribute("name", value);
  }
  get type() {
    return this.getAttribute("type");
  }
  set type(value) {
    this.setAttribute("type", value);
  }
  get inode() {
    return this.getAttribute("inode");
  }
  set inode(value) {
    this.setAttribute("inode", value);
  }
  get path() {
    var folder = this,
        path = "";

    while (rootFolder.body.contains(folder)) {
      path = "/" + folder.name + path;
      folder = folder.parentNode.parentNode;
    }
    return path;
  }
  static keydownSlot(event) {
    var key = event.key;

    if ("\\/:*?\"<>|".indexOf(key) !== -1) event.preventDefault();
    else if (key === "Enter") {
      event.preventDefault();
      this.blur();
    }
  }
  static clickSlot(event) {
    var file = this.parentNode;

    if (file.matches(".rename, .create")) return;
    if (event.ctrlKey) {
      file.collect();
      return;
    }
    file.select();
  }
  static blurSlot(event) {
    var file = this.parentNode;

    if (file.classList.contains("rename")) {
      var newName = this.innerText.trim();

      file.classList.remove("rename");
      this.removeAttribute("contenteditable");
      this.scrollLeft = 0;
      if (!newName || file.name === newName) {
        this.innerText = file.name;
        return;
      }
      this.innerText = newName;
      file.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "rename-file",
        name: newName,
        path: file.path
      }).then(error => {
        if (error) throw error;
        else file.name = newName;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error renaming file (path = ${file.path}):</span>`, error);
        this.innerText = file.name;
      }).finally(() => {
        file.classList.remove("loading");
      });
    } else if (file.classList.contains("create")) {
      var name = this.innerText.trim(), parent = file.parentNode.parentNode;

      if (!name) {
        file.remove();
        rootFolder.body.updateScroll();
        return;
      }
      file.name = name;
      file.classList.remove("create");
      this.removeAttribute("contenteditable");
      this.scrollLeft = 0;
      parent.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "create-file",
        path: file.path
      }).then(error => {
        if (error) throw error;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error creating file (path = ${file.path}):</span>`, error);
        file.remove();
        rootFolder.body.updateScroll();
      }).finally(() => {
        parent.classList.remove("loading");
      });
    }
  }
}
class qrPage extends HTMLElement {
  connectedCallback() {
    if (this.rendered) return;

    this.draggable = true;

    this.addEventListener("pointerdown", qrPage.pointerDownSlot);
    this.append(this.nameSpan, this.dirSpan, this.closeBtn);

    this.rendered = true;
  }
  rendered = false;
  nameSpan = create("span", {class: "page-name"});
  dirSpan = create("span", {class: "dir-path"});
  closeBtn = create("span", {class: "close-btn"}, closeBtn => {
    closeBtn.addEventListener("click", qrPage.closeSlot);
  });
  set name(value) {
    this.nameSpan.innerText = value;
  }
  get name() {
    return this.nameSpan.innerText;
  }
  set dirpath(value) {
    this.dirSpan.innerText = value;
  }
  get dirpath() {
    return this.dirSpan.innerText;
  }
  set inode(value) {
    this.setAttribute("inode", value);
  }
  get inode() {
    return this.getAttribute("inode");
  }
  set type(value) {
    this.setAttribute("type", value);
  }
  get type() {
    return this.getAttribute("type");
  }
  get path() {
    return this.file.path;
  }
  open() {
    let index = topNav.pageCache.indexOf(this);

    this.classList.add("active");
    this.scrollToView();
    topNav.dispatchEvent(new CustomEvent("pageopened", {detail: this}));
    if (index !== -1) topNav.pageCache.splice(index, 1);
    topNav.recordPages();
  }
  close() {
    this.remove();
    if (this.dirpath) {
      this.dirpath = "";
      topNav.deflict(this.name);
    }
    topNav.dispatchEvent(new CustomEvent("pageclosed", {detail: this}));
    if (!topNav.pageCache.includes(this)) topNav.pageCache.push(this);
    if (!this.classList.contains("active") || !topNav.children.length)
      setTimeout(() => topNav.recordPages());
  }
  pin() {
    this.classList.remove("unpined");
    topNav.recordPages();
  }
  save() {
    if (this.classList.contains("unpined")) this.pin();
    if (
      this.type === "video" ||
      this.type === "audio" ||
      this.type === "image" ||
      this.type === "pdf" ||
      this.type === "zip" ||
      this.type === "exe" ||
      this.type === "binary"
    ) {
    } else Sse.send("sse-send.jsp", {
      action: "save-file",
      inode: this.inode
    }).then(result => {
      if (result) throw result;
      topNav.dispatchEvent(new CustomEvent("pagesaved", {detail: this}));
    }).catch(error => {
      dialog.alert(`<span style='color: red'>Error saving file (path = ${this.path}):</span>`, error);
    });
  }
  scrollToView() {
    if (this.offsetLeft - 24 < topNav.scrollLeft) {
      topNav.style.scrollBehavior = "smooth";
      topNav.scrollLeft = this.offsetLeft - 24;
      topNav.style.scrollBehavior = "";
    } else if (this.offsetLeft + this.offsetWidth + 24 > topNav.scrollLeft + topNav.offsetWidth) {
      topNav.style.scrollBehavior = "smooth";
      topNav.scrollLeft = this.offsetLeft + this.offsetWidth + 24 - topNav.offsetWidth;
      topNav.style.scrollBehavior = "";
    }
  }
  static pointerDownSlot(event) {
    var activePage = topNav.querySelector(".active");

    if (event.target === this.closeBtn) {
      event.preventDefault();
      return;
    }
    if (activePage !== this) this.file.select();
    else {
      if (this.viewer.view) setTimeout(() => {
        this.viewer.view.focus();
      });
    }
  }
  static closeSlot() {
    var pages = topNav.children, page = this.parentNode;

    page.close();
    for (let p of pages) {
      if (p.index > page.index) p.index--;
      if (p.index === pages.length - 1) p.file.select();
    }
  }
}
const sideNav = create("nav", {class: "side-nav"}, sideNav => {
  function deleteFiles(target) {
    var paths = [], parent = target.parentNode.parentNode;

    if (target === rootFolder) return;
    if (target.closest(".collect:not(.save, .cut)")) {
      for (let collected of sideNav.querySelectorAll(".collect:not(.save, .cut)"))
        paths.push(collected.path);  
    } else paths.push(target.path);

    dialog.confirm(`Are you sure to delete the the following ${paths.length}?`, paths.join("<br>")).then(yes => {
      if (!yes) return;
      parent.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "delete-file",
        paths
      }).then(error => {
        if (error) throw error;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error deleting files:</span>`, error.replace("\n", "<br>"));
      }).finally(() => {
        parent.classList.remove("loading");
      });
    });
  }

  sideNav.deleteFiles = function () {
    var target = this.querySelector(".select");

    if (!target) target = this.querySelector(".collect")
    if (target && target.matches("qr-file, qr-folder")) deleteFiles(target);
  };

  function isPastable(target) {
    let action;

    if (sideNav.querySelector(".copy")) action = "copy-file";
    else if (sideNav.querySelector(".cut")) action = "move-file";
    else {
      pasteMenu.classList.add("disable");
      return false;
    }
    for (let fItem of sideNav.querySelectorAll(".copy, .cut")) {
      if (target === fItem.parentNode.parentNode && action === "move-file") {
        pasteMenu.classList.add("disable");
        return false;
      }
      if (fItem.contains(target)) {
        pasteMenu.classList.add("disable");
        return false;
      }
    }
    pasteMenu.classList.remove("disable");
    return true;
  }

  sideNav.isPastable = function () {
    var target = contextMenu.targetElement;

    if (target?.matches("qr-folder")) isPastable(target);
  };

  function pasteFiles(target) {
    let paths = [], action;

    if (sideNav.querySelector(".copy")) action = "copy-file";
    else if (sideNav.querySelector(".cut")) action = "move-file";
    if (!action || !target) return;
    for (let fItem of sideNav.querySelectorAll(".copy, .cut")) {
      if (target === fItem.parentNode.parentNode && action === "move-file") return;
      if (fItem.contains(target)) return;

      paths.push(fItem.path);
    }
    target.classList.add("loading");

    let focusedFile = sideNav.querySelector(".dir-head:focus:not(.collect), .file-head:focus:not(.collect)");

    Sse.send("sse-send.jsp", {
      action, 
      paths,
      path: target.path
    }).then(error => {
      if (error) throw error;
    }).catch(error => {
      dialog.alert(`<span style='color: red'>Error pasting files:</span>`, error.replace("\n", "<br>"));
    }).finally(() => {
      target.classList.remove("loading");
      for (let fItem of sideNav.querySelectorAll(".copy"))
        fItem.classList.remove("copy", "collect");
      if (focusedFile) {
        focusedFile.parentNode.classList.add("select");
        setTimeout(focusedFile.focus.bind(focusedFile));
      }
      pasteMenu.classList.add("disable")
    });
  }

  sideNav.pasteFiles = function () {
    var target = sideNav.querySelector("qr-folder.cwd")
    pasteFiles(target);
  };

  const contextMenu = create("div", {class: "context-menu"}, menu => {
    menu.dismiss = () => {
      if (!contextMenu.firstElementChild) return;
      contextMenu.innerHTML = "";
      contextMenu.remove();
    };
  }), refreshMenu = create("div", {class: "refresh-menu"}, item => {
    item.innerText = "Refresh";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      target.refresh();
      contextMenu.dismiss();
    });
  }), renameMenu = create("div", {class: "rename-menu"}, item => {
    item.innerText = "Rename";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement,
          selection = document.getSelection(),
          index = target.name.lastIndexOf(".");

      if (index === -1) index = target.name.length;

      selection.empty();
      selection.setBaseAndExtent(target.head.childNodes[0], 0, target.head.childNodes[0], index);
      contextMenu.dismiss();
      target.classList.add("rename");
      target.head.contentEditable = (navigator.userAgent.indexOf("Firefox") === -1) ? "plaintext-only" : true;
      target.head.spellcheck = false;
      target.head.focus();
    });
  }), fileMenu = create("div", {class: "file-menu"}, item => {
    item.innerText = "New File";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      create("qr-file", {class: "create"}, file => {
        var firstFile;

        if (!target.opened) target.head.click();

        if (!target.setted) {
          target.addEventListener("setup", () => {
            for (let fItem of target.body.children) {
              if (fItem.tagName === "QR-FILE") {
                firstFile = fItem;
                break;
              }
            }

            if (firstFile) firstFile.before(file);
            else target.body.append(file);
            rootFolder.body.updateScroll();

            if (!target.opened) target.head.click();

            file.head.contentEditable = (navigator.userAgent.indexOf("Firefox") === -1) ? "plaintext-only" : true;
            file.head.spellcheck = false;
            file.head.focus();
          }, {once: true});
        } else {
          for (let fItem of target.body.children) {
            if (fItem.tagName === "QR-FILE") {
              firstFile = fItem;
              break;
            }
          }

          if (firstFile) firstFile.before(file);
          else target.body.append(file);
          rootFolder.body.updateScroll();
          file.head.contentEditable = (navigator.userAgent.indexOf("Firefox") === -1) ? "plaintext-only" : true;
          file.head.spellcheck = false;
          file.head.focus();
        }
      });
    });
  }), folderMenu = create("div", {class: "folder-menu"}, item => {
    item.innerText = "New Folder";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      create("qr-folder", {class: "create"}, folder => {
        if (!target.opened) target.head.click();

        if (!target.setted) {
          target.addEventListener("setup", () => {
            target.body.prepend(folder);
            rootFolder.body.updateScroll();

            folder.head.contentEditable = (navigator.userAgent.indexOf("Firefox") === -1) ? "plaintext-only" : true;
            folder.head.spellcheck = false;
            folder.head.focus();
          }, {once: true});
        } else {
          target.body.prepend(folder);
          rootFolder.body.updateScroll();

          folder.head.contentEditable = (navigator.userAgent.indexOf("Firefox") === -1) ? "plaintext-only" : true;
          folder.head.spellcheck = false;
          folder.head.focus();
        }
      });
    });
  }), compressMenu = create("div", {class: "compress-menu"}, item => {
    item.innerText = "Compress";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement, paths = [];

      if (target.closest(".collect:not(.save, .cut)")) {
        for (let collected of sideNav.querySelectorAll(".collect:not(.save, .cut)"))
          paths.push(collected.path);  
      } else paths.push(target.path);

      target.parentNode.parentNode.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "compress-file",
        paths, path: target.path
      }).then(error => {
        if (error) throw error;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error compressing files:</span>`, error);
      }).finally(() => {
        target.parentNode.parentNode.classList.remove("loading");
      });
      contextMenu.dismiss();
    });
  }), extractMenu = create("div", {class: "extract-menu"}, item => {
    item.innerText = "Extract";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      target.parentNode.parentNode.classList.add("loading");
      Sse.send("sse-send.jsp", {
        action: "extract-file",
        path: target.path
      }).then(error => {
        if (error) throw error;
      }).catch(error => {
        dialog.alert(`<span style='color: red'>Error extracting file (path = ${target.path}):</span>`, error);
      }).finally(() => {
        target.parentNode.parentNode.classList.remove("loading");
      });
      contextMenu.dismiss();
    });
  }), copyMenu = create("div", {class: "copy-menu"}, item => {
    item.innerText = "Copy";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      if (!target.closest(".collect")) target.collect();
      for (let collected of sideNav.querySelectorAll(".collect")) {
        collected.classList.remove("cut");
        collected.classList.add("copy");
      }

      contextMenu.dismiss();
    });
  }), cutMenu = create("div", {class: "cut-menu"}, item => {
    item.innerText = "Cut";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      if (!target.closest(".collect")) target.collect();
      for (let collected of sideNav.querySelectorAll(".collect")) {
        collected.classList.remove("copy");
        collected.classList.add("cut");
      }

      contextMenu.dismiss();
    });
  }), pasteMenu = create("div", {class: "paste-menu"}, item => {
    item.innerText = "Paste";
    item.addEventListener("click", event => {
      pasteFiles(contextMenu.targetElement);
      contextMenu.dismiss();
    });
  }), copyPathMenu = create("div", {class: "copy-path-menu"}, item => {
    item.innerText = "Copy Path";
    item.addEventListener("click", () => {
      var target = contextMenu.targetElement;

      navigator.clipboard?.writeText(location.origin + target.path);
      contextMenu.dismiss();
    });
  }), downloadMenu = create("div", {class: "download-menu"}, item => {
    item.innerText = "Download";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement,
          downloader = create("a", {
            href: "download.jsp?path=" + target.path,
            download: ""
          });

      downloader.click();
      contextMenu.dismiss();
    });
  }), uploadFile = create("div", {class: "upload-file"}, item => {
    item.innerText = "Upload File";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      progress.uploadFile(target.path);
      contextMenu.dismiss();
    });
  }), uploadFolder = create("div", {class: "upload-folder"}, item => {
    item.innerText = "Upload Folder";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      progress.uploadDir(target.path);
      contextMenu.dismiss();
    });
  }), deleteMenu = create("div", {class: "delete-menu"}, item => {
    item.innerText = "Delete";
    item.addEventListener("click", event => {
      var target = contextMenu.targetElement;

      deleteFiles(target);
      contextMenu.dismiss();
    });
  });

  contextMenu.addEventListener("pointerdown", event => {
    event.preventDefault();
  });

  function constructContextMenu() {
    var target = document.activeElement, parent = target.parentNode;

    if (parent === rootFolder) {
      contextMenu.append(fileMenu, folderMenu, refreshMenu, pasteMenu, uploadFile, uploadFolder);
      sideNav.append(contextMenu);
    } else if (parent.tagName === "QR-FOLDER") {
      if (!parent.loaded || parent.matches(".rename, .create")) return;

      contextMenu.append(fileMenu, folderMenu, refreshMenu, renameMenu, compressMenu, 
                         cutMenu, copyMenu, pasteMenu, copyPathMenu, uploadFile, uploadFolder, downloadMenu, deleteMenu);
    } else if (parent.tagName === "QR-FILE") {
      if (parent.matches(".rename, .create")) return;

      if (parent.matches("[type=zip]")) 
        contextMenu.append(renameMenu, extractMenu, cutMenu, copyMenu, copyPathMenu, downloadMenu, deleteMenu);
      else
        contextMenu.append(renameMenu, compressMenu, cutMenu, copyMenu, copyPathMenu, downloadMenu, deleteMenu);
    }

    if (contextMenu.firstElementChild) {
      contextMenu.targetElement = parent;
      sideNav.append(contextMenu);
      if (contextMenu.contains(pasteMenu)) sideNav.isPastable();
      return true
    }
    return false;
  }

  sideNav.addEventListener("contextmenu", event => {
    event.preventDefault();

    if (contextMenu.contains(event.target) || !constructContextMenu()) return;
    
    if (innerHeight - event.clientY - contextMenu.offsetHeight < 0)
      contextMenu.style.top = event.clientY - contextMenu.offsetHeight + "px";
    else
      contextMenu.style.top = event.clientY + "px";
    if (innerWidth - event.clientX - contextMenu.offsetWidth < 0)
      contextMenu.style.left = event.clientX - contextMenu.offsetWidth + "px";
    else
      contextMenu.style.left = event.clientX + "px";
  });

  if (document.ontouchstart === null) sideNav.addEventListener("touchstart", function (event) {
    var touches = event.touches;

    if (touches.length === 2) {
      let clientX, clientY;

      if (!constructContextMenu()) return;

      ({x: clientX, y: clientY} = document.activeElement.getBoundingClientRect());

      clientX += sideNav.offsetWidth - 12;
      clientY += 12;

      if (innerHeight - clientY - contextMenu.offsetHeight < 0)
        contextMenu.style.top = clientY - contextMenu.offsetHeight + "px";
      else
        contextMenu.style.top = clientY + "px";
      if (innerWidth - event.clientX - contextMenu.offsetWidth < 0)
        contextMenu.style.left = clientX - contextMenu.offsetWidth + "px";
      else
        contextMenu.style.left = clientX + "px";
    } else if (event.touches.length === 3) {
      for (let fItem of sideNav.querySelectorAll(".collect")) 
        fItem.classList.remove("collect", "copy", "cut");
      contextMenu.dismiss();
    }
  });

  sideNav.contextMenu = contextMenu;

  sideNav.addEventListener("keydown", event => {
    var key = event.key?.toLowerCase();

    if (event.target.contentEditable !== "inherit") return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (key === "a") {
        let cwd = sideNav.querySelector("qr-folder.cwd");

        if (cwd) 
          for (let fItem of cwd.body.children) 
            if (!fItem.classList.contains("collect")) fItem.collect();
      } else if (key === "c") {
        sideNav.querySelector(".select:not(.collect)")?.collect();
        for (let collected of sideNav.querySelectorAll(".collect")) {
          collected.classList.remove("cut");
          collected.classList.add("copy");
        }
        sideNav.isPastable();
      } else if (key === "d") {
        sideNav.deleteFiles();
      } else if (key === "x") {
        sideNav.querySelector(".select:not(.collect)")?.collect();
        for (let collected of sideNav.querySelectorAll(".collect")) {
          collected.classList.remove("copy");
          collected.classList.add("cut");
        }
        sideNav.isPastable();
      } else if (key === "z") {
        for (let collected of sideNav.querySelectorAll(".collect")) {
          if (collected.classList.contains("copy")) collected.classList.remove("copy");
          else if (collected.classList.contains("cut")) collected.classList.remove("cut");
          else collected.classList.remove("collect");
        }
        sideNav.querySelector(".dir-head:focus:not(.collect), .file-head:focus:not(.collect)")?.parentNode.classList.add("select");
        pasteMenu.classList.add("disable");
      } else if (key === "v")
        sideNav.pasteFiles();
    }
  });

  const dragWidget = create("div", {class: "drag-widget", draggable: true}, widget => {
    var text = create("div");

    widget.setText = value => text.innerText = value;
    widget.addEventListener("dragstart", event => {
      var target = document.activeElement, parent = target.parentNode;

      if (parent === rootFolder) {
        event.preventDefault();
        return;
      }
      if (parent.tagName === "QR-FOLDER") { 
        if (!parent.loaded || parent.matches(".rename, .create")) {
          event.preventDefault();
          return;
        }
      } else if (parent.tagName === "QR-FILE") {
        if (parent.matches(".rename, .create")) {
          event.preventDefault();
          return;
        }
      } else {
        event.preventDefault();
      }

      setTimeout(() => text.style.visibility = "");
      if (parent.closest(".collect:not(.copy, .cut)")) {
        let data = "", count = 0;

        for (let collected of sideNav.querySelectorAll(".collect:not(.copy, .cut)")) {
          data += location.origin + collected.path + "\n";
          count++;
        }
        event.dataTransfer.setData("text", data.trim());
        if (count > 1) widget.setText(count);
        else widget.setText(parent.closest(".collect").name);
      } else {
        event.dataTransfer.setData("text", location.origin + parent.path);
        widget.setText(parent.name);
      }
      text.style.visibility = "visible";
      sideNav.append(widget);
      widget.targetElement = parent;
    });
    widget.addEventListener("dragend", event => {
      sideNav.querySelector("qr-folder.drag")?.classList.remove("drag");
      widget.targetElement = undefined;
    });
    widget.append(text);
  });

  if (CHROMIUM && document.ontouchstart === undefined) sideNav.addEventListener("pointerdown", event => {
    event.target.setPointerCapture(event.pointerId);
    event.target.addEventListener("lostpointercapture", () => {
      dragWidget.setText("");
      dragWidget.remove();
    }, {once: true});
    dragWidget.style.top = event.clientY - 4 + "px";
    dragWidget.style.left = event.clientX - 4 + "px";
    sideNav.append(dragWidget);
  });

  sideNav.dragStartSlot = function (event) {
    var target = event.target, parent = target.closest("qr-folder"),
        dragged = dragWidget.targetElement, draggeds;

    if (!parent) return;
    if (dragged && sideNav.contains(dragged)) {
      if (dragged.closest(".collect:not(.copy, .cut)"))
        draggeds = sideNav.querySelectorAll(".collect:not(.copy, .cut)");
      else
        draggeds = [dragged];
      for (let dragged of draggeds) {
        if (dragged.parentNode.parentNode === parent) return;
        if (dragged.contains(parent)) return;
      }
    }

    if (!parent.classList.contains("drag")) {
      sideNav.querySelector("qr-folder.drag")?.classList.remove("drag");
      parent.classList.add("drag");
      clearTimeout(dragWidget.dragTimeout);
      if (!parent.opened) {
        dragWidget.dragTimeout = setTimeout(() => {
          if (!parent.opened && parent.classList.contains("drag")) {
            if (!parent.initiated) {
              parent.append(parent.body);
              parent.setup();
              parent.initiated = true;
              parent.addEventListener("setup", () => {
                parent.open();
              }, {once: true});
            } else {
              parent.open();
            }
          }
        }, 1000);
      }
    }
    event.preventDefault();
  };

  sideNav.addEventListener("dragenter", sideNav.dragStartSlot);
  sideNav.addEventListener("dragover", sideNav.dragStartSlot);
  sideNav.addEventListener("dragleave", event => {
    var draggedOver = sideNav.querySelector("qr-folder.drag"),
        relatedTarget = event.relatedTarget;

    if ((!relatedTarget || !relatedTarget.closest("qr-folder.drag")) && draggedOver) {
      draggedOver.classList.remove("drag");
      clearTimeout(dragWidget.dragTimeout);
    }
  });
  sideNav.addEventListener("drop", event => {
    var target = event.target, parent = target.closest("qr-folder"),
        paths = event.dataTransfer.getData("text").split("\n").map(path => path.replace(location.origin, "")),
        files = event.dataTransfer.files;

    if (!parent) return;
    if (parent.classList.contains("drag")) {
      if (files.length) {
        event.preventDefault();
        let filesToUpload = [];

        for (let file of files)
          if (file.size % 1024) 
            filesToUpload.push(file);

        if (filesToUpload.length) progress.upload(filesToUpload, parent.path);
      } else if (paths[0].trim()) {
        qrFolder.findByPath(paths[0]).then(result => {
          if (!result || result === rootFolder) return;
          parent.classList.add("loading");
          Sse.send("sse-send.jsp", {
            action: "move-file",
            paths,
            path: parent.path
          }).then(error => {
            if (error) throw error;
          }).catch(error => {
            dialog.alert(`<span style='color: red'>Error moving files:</span>`, error.replace("\n", "<br>"));
          }).finally(() => {
            parent.classList.remove("loading");
          });
        })
      }
    }
    sideNav.querySelector("qr-folder.drag")?.classList.remove("drag");
  });

  create("div", {class: "nav-toggle"}, navToggle => {
    navToggle.innerHTML = "<div><div></div></div><div></div><div><div></div></div>";
    navToggle.addEventListener("click", () => {
      if (document.body.classList.toggle("nav-hidden"))
        localStorage["--side-width"] = "-" + Number.parseFloat(document.body.style.getPropertyValue("--side-width"));
      else
        localStorage["--side-width"] = Number.parseFloat(document.body.style.getPropertyValue("--side-width"));
    });
    sideNav.append(navToggle);
  });

  create("div", {class: "page-title"}, pageTitle => {
    pageTitle.innerText = document.title;
    sideNav.append(pageTitle);
  });

  create("qr-resizerx", {}, resizer => {
    var startWidth = +localStorage["--side-width"];

    if (startWidth < 0) {
      document.body.style.transition = "none";
      sideNav.style.transition = "none";
      document.body.classList.add("nav-hidden");
      document.body.style.setProperty("--side-width", -startWidth + "px");
      startWidth = 0;
    } else if (startWidth === 0) {
      document.body.style.transition = "none";
      sideNav.style.transition = "none";
      document.body.classList.add("nav-hidden");
      document.body.style.setProperty("--side-width", 225 + "px");
    } else {
      if (isNaN(startWidth)) startWidth = 225;
      document.body.style.transition = "none";
      sideNav.style.transition = "none";
      document.body.style.setProperty("--side-width", startWidth + "px");
    }
    setTimeout(() => {
      document.body.style.transition = "";
      sideNav.style.transition = "";
    });

    resizer.addEventListener("resizestart", () => {
      if (document.body.classList.contains("nav-hidden"))
        startWidth = 0;
      else 
        startWidth = Number.parseFloat(document.body.style.getPropertyValue("--side-width"));

      document.body.style.transition = "none";
      sideNav.style.transition = "none";
      topNav.parentNode.style.transition = "none";
      topNav.nextElementSibling.style.transition = "none";
    });
    resizer.addEventListener("resize", event => {
      var newWidth = startWidth + event.detail;

      if (newWidth < 100) {
        if (!document.body.classList.contains("nav-hidden"))
          document.body.classList.add("nav-hidden");
        newWidth = 225;
        localStorage["--side-width"] = 0;
      } else {
        if (document.body.classList.contains("nav-hidden"))
          document.body.classList.remove("nav-hidden");
        if (newWidth < 225) newWidth = 225;
        else if (newWidth > 800) newWidth = 800;
        localStorage["--side-width"] = newWidth;
      }

      topNav.updateScroll();
      document.body.style.setProperty("--side-width", newWidth + "px");
    });
    resizer.addEventListener("resizeend", () => {
      document.body.style.transition = "";
      sideNav.style.transition = "";
      topNav.parentNode.style.transition = "";
      topNav.nextElementSibling.style.transition = "";
    });

    sideNav.append(resizer);
  });

  document.body.append(sideNav);
});
const rootFolder = create("qr-folder", {path: "/", inode: await Sse.send("sse-send.jsp", {action: "of-inode", path: "/"})}, folder => {
  sideNav.append(folder);
  folder.addEventListener("render", () => {
    create("qr-slidery", {}, scrollBar => {
      var ended = false, body = folder.body;

      scrollBar.linkedElem = body;
      sideNav.append(scrollBar);

      body.tabIndex = -1;
      body.addEventListener("transitionstart", function updateScroll(event) {
        ended = false;
        requestAnimationFrame(() => {
          body.updateScroll();
          if (!ended) updateScroll();
        });
      }, true);
      body.addEventListener("transitionend", () => ended = true, true);
      body.addEventListener("focusin", () => {
        sideNav.querySelector(".cwd")?.classList.remove("cwd");
        folder.classList.add("cwd");
      });
    });

    folder.connect();
  }, {once: true});
});
const topNav = create("nav", {class: "top-nav"}, topNav => {
  var getPage = Queue.cacheCall((file, resolve) => {
    resolve(create("qr-page", {}, page => {
      const listeners = {
        "renamed": () => {
          var oldName = page.name;

          page.name = file.name;
          deflict(oldName);
          deflict(page.name);
          topNav.dispatchEvent(new CustomEvent("pagerenamed", {detail: page}));
        },
        "retyped": () => {
          page.type = file.type;
          page.dispatchEvent(new CustomEvent("retyped"));
        },
        "moved": () => {
          deflict(page.name);
          topNav.dispatchEvent(new CustomEvent("pagemoved", {detail: page}));
        },
        "deleted": () => {
          var pages = topNav.children, index = topNav.pageCache.indexOf(page),
              pageToOpen;

          page.remove();
          if (page.dirpath) {
            page.dirpath = "";
            deflict(page.name);
          }
          for (let p of pages) {
            if (p.index > page.index) p.index--;
            if (p.index === pages.length - 1) pageToOpen = p;
          }
          setTimeout(() => {
            if (topNav.contains(pageToOpen)) pageToOpen.file.select();
          });
          getPage.map.delete(file);
          if (index !== -1) topNav.pageCache.splice(index, 1);
          page.dispatchEvent(new CustomEvent("deleted"));
          topNav.dispatchEvent(new CustomEvent("pagedeleted", {detail: page}));
        }
      }
      page.file = file;
      page.inode = file.inode;
      page.name = file.name;
      page.type = file.type;

      for (let listener in listeners)
        file.addEventListener(listener, listeners[listener]);
      page.unlink = () => {
        for (let listener in listeners)
          file.removeEventListener(listener, listeners[listener]);
      };
    }));
  });

  topNav.getPage = getPage;

  function deflict(name) {
    var pages = topNav.children, conflicts = [], dirpaths = [], dirpaths2 = [];

    for (let page of pages)
      if (page.name === name)
        conflicts.push(page);

    if (!conflicts.length) return;
    if (conflicts.length > 1)
      for (let page of conflicts) {
        page.dirpath = calcDirpath(page);
        if (dirpaths.includes(page.dirpath)) {
          if (!dirpaths2.includes(page.dirpath)) dirpaths2.push(page.dirpath);
        } else {
          dirpaths.push(page.dirpath);
        }
      }
    else conflicts[0].dirpath = "";
    for (let dirpath of dirpaths2) {
      deflictDirpath(dirpath);
    }
  }

  function deflictDirpath(dirpath) {
    var pages = topNav.children, from = 0,
    conflicts = [], dirpaths = [], dirpaths2 = [];

    for (let page of pages)
      if (page.dirpath === dirpath)
        conflicts.push(page);
    if (conflicts.length < 2) return;
    
    while (true) {
      let toBreak = false, dirpath = calcDirpath(conflicts[0], from);

      dirpaths.length = 0;
      dirpaths2.length = 0;
      for (let page of conflicts) {
        page.dirpath = calcDirpath(page, from);
        if (page.dirpath !== dirpath) toBreak = true;
        if (dirpaths.includes(page.dirpath)) {
          if (!dirpaths2.includes(page.dirpath)) dirpaths2.push(page.dirpath);
        } else {
          dirpaths.push(page.dirpath);
        }
      }
      if (toBreak) break;
      from++;
    }
    if (dirpaths2.length) for (let to = from + 2; dirpaths2.length; to++) {
      dirpaths.length = 0;
      dirpaths2.length = 0;
      for (let page of conflicts) {
        page.dirpath = calcDirpath(page, from, to);
        if (dirpaths.includes(page.dirpath)) {
          if (!dirpaths2.includes(page.dirpath)) dirpaths2.push(page.dirpath);
        } else {
          dirpaths.push(page.dirpath);
        }
      }
    }
  }

  function calcDirpath(page, from = 0, to = from + 1) {
    var parentNode = page.file.parentNode.parentNode;

    if (parentNode === rootFolder) return "/";
    
    var i = 0, start = "/…/", names = [], end = from ? "/…" : "";

    while (true) {
      if (i >= from) names.unshift(parentNode.name);
      i++;
      parentNode = parentNode.parentNode.parentNode;
      if (i === to && parentNode === rootFolder) {
        start = "/";
        break;
      } 
      if (i === to || parentNode === rootFolder) break;
    }

    return start + names.join("/") + end;
  }

  topNav.deflict = deflict;

  async function openPage(file) {
    var unpined = topNav.querySelector(".unpined"),
        activePage = topNav.querySelector(".active"),
        page = await getPage(file), pages = topNav.children;

    if (!topNav.contains(page)) {
      if (activePage) {
        if (unpined) {
          if (unpined === activePage) {
            unpined.replaceWith(page);
            unpined.close();
          } else {
            unpined.close();
            for (let p of pages) if (p.index > unpined.index) p.index--;
            activePage.after(page);
          }
        } else {
          activePage.after(page);
        }
      } else {
        topNav.append(page);
      }
      page.index = pages.length - 1;
      activePage?.classList.remove("active");
      page.classList.add("unpined");
      deflict(page.name);
      page.open();
    } else {
      if (activePage !== page) {
        if (activePage) {
          for (let p of pages) if (p.index > page.index) p.index--;
          page.index = pages.length - 1;
          activePage.classList.remove("active");
          page.open();
        } else {
          page.open();
        }
      }
    }
  }

  topNav.forward = () => {
    var pages = topNav.children,
        activePage = topNav.querySelector(".active"),
        targetPage;

    if (pages.length < 2) return;

    for (let p of pages) {
      if (p.index === 0) targetPage = p;
      else p.index--;
    }

    targetPage.index = pages.length - 1;
    activePage.classList.remove("active");
    targetPage.file.select();
  };
  topNav.backward = () => {
    var pages = topNav.children,
        activePage = topNav.querySelector(".active"),
        targetPage;

    if (pages.length < 2) return;

    for (let p of pages) {
      if (p.index === pages.length - 2) targetPage = p;
      p.index++;
    }

    activePage.index = 0;
    activePage.classList.remove("active");
    targetPage.file.select();
  };
  topNav.downward = () => {
    topNav.querySelector(".active")?.closeBtn.click();
  };
  topNav.upward = () => {
    var pageCache = topNav.pageCache, length = pageCache.length,
        page;

    if (!length) return;
    page = pageCache[length - 1];
    page.file.select();
    setTimeout(() => page.pin());
  };

  topNav.pageCache = [];

  topNav.recordPages = () => {
    var pages = topNav.children, arr = [];

    for (let p of pages) {
      if (p.classList.contains("unpined")) arr.push({index: p.index, inode: p.inode, unpined: true});
      else arr.push({index: p.index, inode: p.inode});
    }

    localStorage["--qr-pages"] = JSON.stringify(arr);
    topNav.updateScroll();
  }

  (async () => {
    try {
      let paths = JSON.parse(localStorage["--qr-pages"]),
          result = JSON.parse(await Sse.send("sse-send.jsp", {
            action: "of-path",
            paths
          }));

      for (let pageInfo of result)
        if (!pageInfo.path)
          for (let p of result) 
            if (p.index > pageInfo.index) p.index--;

      for (let pageInfo of result) {
        if (!pageInfo.path) continue;

        let file = await qrFolder.findByPath(pageInfo.path),
            page = await getPage(file);

        if (pageInfo.unpined) page.classList.add("unpined");

        page.index = pageInfo.index;
        topNav.append(page);
        deflict(page.name);
      }

      for (let page of topNav.children)
        if (page.index === topNav.children.length - 1) {
          page.file.select();
          break;
        }

      topNav.updateScroll();
    } catch (error) {
    }
  })();

  topNav.addEventListener("dragstart", event => {
    var page = event.target;

    event.dataTransfer.setData("text", location.origin + page.file.path);
    page.classList.add("dragstart");
    topNav.dragged = page;
    setTimeout(() => page.classList.remove("dragstart"));
  });
  topNav.addEventListener("dragenter", event => {
    var dragged = topNav.dragged, 
        target = event.target,
        page = target.closest("qr-page");

    event.preventDefault();
    if (!dragged || !page || dragged === page) return;
    if (!page.classList.contains("drag")) {
      topNav.querySelector("qr-page.drag")?.classList.remove("drag");
      page.classList.add("drag");
    }
  });
  topNav.addEventListener("dragover", event => {
    event.preventDefault();
  });
  topNav.addEventListener("dragleave", event => {
    var dragged = topNav.dragged,
        relatedTarget = event.relatedTarget;

    if (!dragged) return;
    if ((!relatedTarget || !relatedTarget.closest("qr-page.drag")))
      topNav.querySelector("qr-page.drag")?.classList.remove("drag");
  });
  topNav.addEventListener("drop", event => {
    var dragged = topNav.dragged,
        page = topNav.querySelector("qr-page.drag");

    if (!dragged || !page) return;

    for (let child of topNav.children) {
      if (child === dragged) {
        page.after(dragged);
        topNav.recordPages();
        break;
      } else if (child === page) {
        page.before(dragged);
        topNav.recordPages();
        break;
      }
    }
  });
  topNav.addEventListener("dragend", () => {
    topNav.dragged = undefined;
    topNav.querySelector("qr-page.drag")?.classList.remove("drag");
  });
  topNav.addEventListener("wheel", function (event) {
    var delta = event.deltaY || event.deltaX;

    if (this.offsetWidth === this.scrollWidth) return;

    if (Math.abs(delta) >= 100) delta *= 0.2;

    this.scrollLeft += delta;
  }, {passive: true});

  sideNav.addEventListener("fileselect", event => {
    openPage(event.detail);
  });

  function runFile(activePage) {
    var type = activePage?.type;

    if (type === "c" || type === "cpp" || type === "h") {
      termContainer.termWindow?.exec("./" + C_FILE);
    } else if (type === "python") {
      termContainer.termWindow?.exec(`${PYTHON} ${activePage.path.slice(1)}`);
    } else if (type === "java") {
      for (let fItem of activePage.file.parentNode.parentNode.body.children) {
        if (fItem.name.toLowerCase() === "main.java") {
          termContainer.termWindow?.exec(`java ${activePage.path.replace(/[^/]*$/, fItem.name).slice(1)}`);
          return;
        }
      }
      termContainer.termWindow?.exec(`java ${activePage.path.slice(1)}`);
    }
  }

  window.addEventListener("keydown", event => {
    var key = event.key?.toLowerCase(), activePage = topNav.querySelector(".active"),
    type = activePage?.type;

    if (event.ctrlKey || event.metaKey) {
      if (key === "s") {
        event.preventDefault();
        if (activePage) activePage.save();
      } else if (key === "arrowleft") {
        event.stopPropagation();
        topNav.backward();
      } else if (key === "arrowright") {
        event.stopPropagation();
        topNav.forward();
      } else if (key === "arrowdown") {
        topNav.downward();
      } else if (key === "arrowup") {
        topNav.upward();
      } else if (key === "r") {
        event.preventDefault();
        mainContainer.refreshFrame();
        runFile(activePage);
      } else if (key === "enter") {
        if (event.shiftKey) return;
        if (activePage) activePage.save();
        if (
          type === "c" || 
          type === "cpp" ||
          type === "python" ||
          type === "java"
        ) topNav.addEventListener("pagesaved", () => runFile(activePage), {once: true});
      } else if (key === "q") {
        event.preventDefault();
        termContainer.termWindow?.quit();
      } else if (key === "e") {
        event.preventDefault();
        if (type === "html") return console.clear();
        if (type === "javascript") {
          let arr = activePage.name.split(".");

          if (arr[arr.length - 1].toLowerCase() === "jsp") return console.clear();
        }
        termContainer.termWindow?.clear();
      } else if (key === "w") {
        event.preventDefault();
      } else if (key === "m") {
        mainContainer.recordSetting({minimap: !mainContainer.setting.minimap});
        activePage?.viewer.toggleMinimap?.(mainContainer.setting.minimap);
      } else if (key === "b") {
        sideNav.querySelector(".nav-toggle").click();
      }
    }
  }, true);
  window.addEventListener("keydown", event => {
    var key = event.key?.toLowerCase();

    if (event.ctrlKey || event.metaKey)
      if (key === "d") event.preventDefault()
  });

  const navContainer = create("div", {class: "nav-container"});

  navContainer.append(topNav, create("qr-sliderx", {}, scrollBar => {
    var ended = false;

    scrollBar.linkedElem = topNav;

    navContainer.addEventListener("transitionstart", function updateScroll(event) {
      ended = false;
      requestAnimationFrame(() => {
        topNav.updateScroll();
        if (!ended) updateScroll();
      });
    }, true);
    navContainer.addEventListener("transitionend", () => ended = true, true);
  }));

  document.body.append(navContainer);
});
const mainContainer = create("div", {class: "main-container"}, mainContainer => {
  const resizer = create("qr-resizerx", {}, resizer => {
          var startWidth = +localStorage["--middle-width"];

          if (isNaN(startWidth)) startWidth = 0;

          mainContainer.style.setProperty("--middle-width", startWidth + "%");

          resizer.addEventListener("resizestart", () => {
            startWidth = editorContainer.offsetWidth + 4 - mainContainer.offsetWidth / 2;
          });
          resizer.addEventListener("resize", event => {
            var newWidth = (startWidth + event.detail) * 100 / mainContainer.offsetWidth;

            if (document.body.classList.contains("preview-off")) return;

            localStorage["--middle-width"] = newWidth;
            mainContainer.style.setProperty("--middle-width", newWidth + "%");

            endCheck();
          });
        }), 
        editorPanel = create("div", {class: "editor-panel"}, editorPanel => {
          const backwardBtn = create("div", {class: "backward-btn"}),
                upwardBtn = create("div", {class: "upward-btn"}),
                forwardBtn = create("div", {class: "forward-btn"}),
                themeBtn = create("div", {class: "theme-btn"}),
                dropBtn = create("div", {class: "drop-btn"}),
                previewBtn = create("div", {class: "preview-btn"});

          backwardBtn.addEventListener("click", topNav.backward);
          forwardBtn.addEventListener("click", topNav.forward);
          upwardBtn.addEventListener("click", topNav.upward);

          themeBtn.addEventListener("click", () => {
            var isDark = document.body.classList.toggle("dark"),
                activePage = topNav.querySelector(".active");

            mainContainer.recordSetting({theme: isDark});

            if (!activePage) return;
            activePage.viewer.retheme?.(isDark);
          });
          dropBtn.addEventListener("click", () => {
            var activePage = topNav.querySelector(".active"), index;

            if (!activePage) return;

            activePage.unlink();
            activePage.closeBtn.click();
            topNav.getPage.map.delete(activePage.file);
            index = topNav.pageCache.indexOf(activePage);
            if (index !== -1) topNav.pageCache.splice(index, 1);
            activePage.dispatchEvent(new CustomEvent("deleted"));
          });
          previewBtn.addEventListener("click", () => {
            var isOff = document.body.classList.toggle("preview-off");

            mainContainer.recordSetting({preview: isOff});

            if (!isOff) {
              let activePage = topNav.querySelector(".active");

              if (setting.address) mainContainer.lock();
              endCheck();
              if (activePage) openFrame(activePage);
            } else {
              mainContainer.lockBtn.classList.remove("locked");
              iframeWrapper.innerHTML = "";
            }
          });

          editorPanel.append(previewBtn, dropBtn, themeBtn,
                             backwardBtn, upwardBtn, forwardBtn);
        }),
        editorContainer = create("div", {class: "editor-container"}),
        editorWrapper = create("div", {class: "editor-wrapper"}),
        iframePanel = create("div", {class: "iframe-panel"}, iframePanel => {
          const refreshBtn = create("div", {class: "refresh-btn"}),
                addressBar = create("input", {class: "address-bar", disabled: ""}),
                lockBtn = create("div", {class: "lock-btn"}),
                copyBtn = create("div", {class: "copy-btn"}),
                targetBtn = create("div", {class: "target-btn"});

          Object.defineProperty(mainContainer, "address", {set(value) {
            addressBar.value = value;
          }, get() {
            return addressBar.value;
          }});

          refreshBtn.addEventListener("click", refreshFrame);
          lockBtn.addEventListener("click", () => {
            var address = addressBar.value,
                activePage = topNav.querySelector(".active");

            if (!address) {
              mainContainer.recordSetting({address: ""});
              return;
            }
            if (document.body.classList.contains("preview-off")) return;
            if (lockBtn.classList.contains("locked")) {
              let page = lockedFrame.page;

              lockBtn.classList.remove("locked");
              mainContainer.recordSetting({address: ""});

              if (page) {
                delete lockedFrame.page;
                if (!topNav.contains(page)) {
                  lockedFrame.remove();
                  addressBar.value = "";
                }
              } else {
                if (
                  activePage &&
                  location.origin + activePage.path === lockedFrame.src
                ) {
                  activePage.iframe = lockedFrame;
                  lockedFrame = undefined;
                  return;
                }
                lockedFrame.remove();
              }
              lockedFrame = undefined;
              if (activePage) openFrame(activePage);
            } else {
              lockBtn.classList.add("locked");
              mainContainer.recordSetting({address});

              if (lockedFrame) {
                openFrame(activePage);
                return;
              }

              if (activePage) {
                let iframe = activePage.iframe;

                if (!iframe) {
                  iframe = create("iframe", {src: address});
                  iframe.onload = loadSlot;
                  iframe.loaded = false;
                  activePage.iframe = iframe;
                } 
                openFrame(activePage);
                lockedFrame = iframe;
                lockedFrame.page = activePage;
              } else {
                lockedFrame = create("iframe", {src: address});
                mainContainer.startFresh();
                lockedFrame.onload = loadSlot;
                lockedFrame.loaded = false;
                lockedFrame.classList.add("active");
                iframeWrapper.append(lockedFrame);
              }
            } 
          });
          mainContainer.startFresh = () => {
            refreshBtn.classList.add("refreshing");
          };
          mainContainer.endFresh = () => {
            refreshBtn.classList.remove("refreshing");
          };
          mainContainer.lockBtn = lockBtn;
          mainContainer.lock = () => {
            if (!lockBtn.classList.contains("locked")) lockBtn.click();
          };
          mainContainer.unlock = () => {
            if (lockBtn.classList.contains("locked")) lockBtn.click();
          };
          copyBtn.addEventListener("click", () => {
            var address = addressBar.value;

            if (!address) return;
            navigator.clipboard?.writeText(addressBar.value);
            copyBtn.classList.add("copied");
            setTimeout(() => copyBtn.classList.remove("copied"), 1000);
          });
          targetBtn.addEventListener("click", () => {
            if (mainContainer.address) window.open(mainContainer.address);
          });

          iframePanel.append(refreshBtn, lockBtn, addressBar, copyBtn, targetBtn);
        }),
        iframeWrapper = create("div", {class: "iframe-wrapper"}),
        frameContainer = create("div", {class: "iframe-container"});

  class Plugin {
    constructor(view) {
      this.view = view;
      this.page = Plugin.page;
      this.page.plugin = this;
      this.inode = Plugin.page.inode;
      this.generation = 0;
      this.lastButTwoDone = undefined;
      this.sending = false;
      Sse.sse.addEventListener(`${this.inode}-edited`, Plugin.editedSlot);
      Sse.sse.addEventListener(`${this.inode}-saved`, Plugin.savedSlot);
    }
    update(update) {
      if (update.docChanged) {
        var dones = this.view.state.values[0].done,
        inputType = update.transactions[0].annotations?.[1]?.value,
        lastButTwoDone = dones[dones.length-2]

        if (dones[0] && !dones[0].changes) dones.shift();
        if (update.transactions[0].annotations?.[2]?.value.version) return;
        if (inputType === "undo") this.generation++;
        else {
          if (inputType === "redo") {
            this.generation--;
          } else if (this.generation < 1) {
            if (this.lastButTwoDone !== lastButTwoDone)
              this.generation--;
          } else this.generation = NaN
        }
        this.lastButTwoDone = lastButTwoDone?.changes ? lastButTwoDone : undefined;
        if (this.generation === 0) {
          if (this.page.classList.contains("unsaved")) this.page.classList.remove("unsaved");
        } else if (!this.page.classList.contains("unsaved")) this.page.classList.add("unsaved");

        this.push();
      }
    }
    push() {
      if (!this.sending) {
        this.sending = true;
        this.send();
      }
    }
    static editedSlot(message) {
      var data = message.data,
      _this = Plugin.getThis(message.type);

      let updates = JSON.parse(data).map(u => ({
        changes: ChangeSet.fromJSON(u.changes),
        clientID: u.clientID
      }));

      _this?.view.dispatch(receiveUpdates(_this.view.state, updates));
    }
    static savedSlot(message) {
      var _this = Plugin.getThis(message.type),
      page = _this.page;

      _this.generation = 0;
      if (page.classList.contains("unsaved")) page.classList.remove("unsaved");
    }
    static getThis(eventType) {
      var inode = eventType.slice(0, eventType.indexOf("-"));

      for (let page of [...topNav.children, ...topNav.pageCache]) 
        if (page.inode === inode) return page.plugin;

      return null;
    }
    async send() {
      let updates = sendableUpdates(this.view.state);
      let version = getSyncedVersion(this.view.state);
      
      if (!updates.length) return this.sending = false;
      try {
        let error = await Sse.send("sse-send.jsp", {
          action: "write-file",
          inode: this.inode,
          version,
          updates: updates.map(u => ({
            clientID: u.clientID,
            changes: u.changes.toJSON()
          }))
        });
        if (error) throw error;
        else this.send();
      } catch (error) {
        window.location.reload();
      }
    }
    destroy() {
      Sse.sse.removeEventListener(`${this.inode}-edited`, Plugin.editedSlot);
      Sse.sse.removeEventListener(`${this.inode}-saved`, Plugin.savedSlot);
    }
  }

  function peerExtension(startVersion, page) {
    Plugin.page = page;
    return [collab({ startVersion }), ViewPlugin.fromClass(Plugin)];
  }
  function refreshFrame() {
    var activeFrame = iframeWrapper.querySelector(".active");

    if (!activeFrame) return;

    activeFrame.src = activeFrame.src;
    mainContainer.startFresh();
  }
  function endCheck() {
    if (editorContainer.offsetWidth) {
      if (!frameContainer.offsetWidth) {
        if (!iframeWrapper.style.boxShadow) iframeWrapper.style.boxShadow = "none";
      } else {
        if (iframeWrapper.style.boxShadow) iframeWrapper.style.boxShadow = "";
        if (editorWrapper.style.boxShadow) editorWrapper.style.boxShadow = "";
      }
    } else if (frameContainer.offsetWidth)
      if (!editorWrapper.style.boxShadow) editorWrapper.style.boxShadow = "none";
  }
  function openFrame(page) {
    var iframe;

    if (lockedFrame) {
      if (!iframeWrapper.contains(lockedFrame)) {
        mainContainer.startFresh();
        lockedFrame.loaded = false;
        iframeWrapper.append(lockedFrame);
        iframeWrapper.querySelector(".active")?.classList.remove("active");
        lockedFrame.classList.add("active");
      }
      return;
    }

    if (page.viewer.matches(".view")) {
      mainContainer.address = "";
      iframeWrapper.querySelector(".active")?.classList.remove("active");
      mainContainer.endFresh();
      return;
    }

    iframe = page.iframe;
    if (!iframe) {
      iframe = create("iframe", {src: page.path});
      page.iframe = iframe;
      mainContainer.startFresh();
      iframe.onload = loadSlot;
    } else {
      if (!iframe.loaded) mainContainer.startFresh();
      else mainContainer.endFresh();
    }
    if (!iframeWrapper.contains(iframe)) {
      mainContainer.startFresh();
      iframe.loaded = false;
      iframeWrapper.append(iframe);
    }
    iframeWrapper.querySelector(".active")?.classList.remove("active");
    iframe.classList.add("active");
    mainContainer.address = iframe.src;
  }

  function getView(page) {
    var type = page.type, view;

    if (type === "video") view = create("video", {src: page.path, controls: ""});
    else if (type === "audio") view = create("audio", {src: page.path, controls: ""});
    else if (type === "image") view = create("img", {src: page.path});
    else if (type === "pdf") view = create("iframe", {src: page.path});
    else if (
      type === "zip" ||
      type === "exe" ||
      type === "binary"
    ) {
      view = create("a", {href: page.path, download: ""});
      view.innerText = "Download File";
    }

    return view;
  }

  const getViewer = Queue.cacheCall((page, resolve) => {
    var viewer = create("div"),
        view = getView(page);

    page.viewer = viewer;

    if (view) {
      viewer.className = "view";
      viewer.append(view)
      resolve(viewer);
    } else Sse.fetch("sse-send.jsp", {
      action: "read-file",
      inode: page.inode
    }).then(result => {
      var { version, doc } = result,
          extensions = createExtensions(peerExtension(version, page)),
          language = languages[page.type],
          languageConf = new Compartment,
          themeConf = new Compartment;

      if (language) extensions.push(languageConf.of(language()))
      else extensions.push(languageConf.of([]));

      if (document.body.classList.contains("dark")) {
        extensions.push(themeConf.of(oneDark));
        viewer.isDark = true;
      } else {
        extensions.push(themeConf.of(oneLight));
        viewer.isDark = false;
      }

      let state = EditorState.create({
        doc,
        extensions
      });

      let view  = new EditorView({ state, parent: viewer });

      viewer.retheme = isDark => {
        if (isDark) {
          viewer.isDark = true;
          view.dispatch({effects: themeConf.reconfigure(oneDark)});
          view.focus();
        } else {
          viewer.isDark = false;
          view.dispatch({effects: themeConf.reconfigure(oneLight)});
          view.focus();
        }
      };
      viewer.remode = mode => {
        let language = languages[mode];

        if (language) language = language();
        else  language = [];

        view.dispatch({
          effects: languageConf.reconfigure(language)
        });
      };
      viewer.toggleMinimap = on => {
        if (viewer.isMinimapOn === on) return;
        toggleMinimap(view, on);
        viewer.isMinimapOn = on;
      };
      if (mainContainer.setting.minimap) viewer.toggleMinimap(true);

      viewer.classList.add("editor");
      viewer.view = view;
      viewer.state = state;      
    }).catch(error => {
      viewer.className = "error";
      viewer.append(create("a", {}, elem => {
        elem.innerText = "No Such File";
      }));
    });
    
    resolve(viewer);
    
    page.addEventListener("retyped", retypeSlot);
    page.addEventListener("deleted", deleteSlot);
  });

  function retypeSlot() {
    var view = getView(this),
        viewer = this.viewer;

    if (view) {
      if (this.plugin) {
        let iframe = this.iframe;

        if (iframe) {
          delete this.iframe;
          iframe.remove();
          if (lockedFrame) {
            if (lockedFrame === iframe) {
              mainContainer.lockBtn.classList.remove("locked");
              mainContainer.address = "";            
              mainContainer.recordSetting({address: ""});
              lockedFrame = undefined;
              mainContainer.endFresh();
            }
          } else if (iframe.classList.contains("active")) {
            mainContainer.address = "";
            mainContainer.recordSetting({address: ""});
            mainContainer.endFresh();
          }
        }

        viewer.view.destroy();
        viewer.classList.remove("editor");
        viewer.classList.add("view");
        delete viewer.view;
        delete viewer.state;
        delete viewer.retheme;
        delete viewer.remode;
        delete viewer.isDark;
        delete viewer.toggleMinimap;
        delete viewer.isMinimapOn;
        delete this.plugin;
        delete this.iframe;
      }
      viewer.innerHTML = "";
      viewer.append(view);
    } else {
      if (this.plugin) {
        viewer.remode(this.type);
      } else Sse.send("sse-send.jsp", {
        action: "read-file",
        inode: this.inode
      }).then(result => {
        var { version, doc } = JSON.parse(result),
            extensions = createExtensions(peerExtension(version, this)),
            language = languages[this.type],
            languageConf = new Compartment,
            themeConf = new Compartment;

        if (language) extensions.push(languageConf.of(language()))
        else extensions.push(languageConf.of([]));

        if (document.body.classList.contains("dark")) {
          extensions.push(themeConf.of(oneDark));
          viewer.isDark = true;
        } else {
          extensions.push(themeConf.of(oneLight));
          viewer.isDark = false;
        }

        viewer.innerHTML = "";
        viewer.classList.remove("view");
        viewer.classList.add("editor");
        if (this.classList.contains("active")) setTimeout(() => openFrame(this));

        let state = EditorState.create({
          doc,
          extensions
        });

        let view  = new EditorView({ state, parent: this.viewer });

        viewer.retheme = isDark => {
          if (isDark) {
            viewer.isDark = true;
            view.dispatch({effects: themeConf.reconfigure(oneDark)});
            view.focus();
          } else {
            viewer.isDark = false;
            view.dispatch({effects: themeConf.reconfigure(oneLight)});
            view.focus();
          }
        };
        viewer.remode = mode => {
          let language = languages[mode];

          if (language) language = language();
          else  language = [];

          view.dispatch({
            effects: languageConf.reconfigure(language)
          });
        };
        viewer.toggleMinimap = on => {
          if (viewer.isMinimapOn === on) return;
          toggleMinimap(view, on);
          viewer.isMinimapOn = on;
        };
        if (mainContainer.setting.minimap) viewer.toggleMinimap(true);

        viewer.view = view;
        viewer.state = state;
      }).catch(error => {
        viewer.innerHTML = "";
        viewer.className = "error";
        if (this.classList.contains("active")) viewer.classList.add("active");
        viewer.append(create("a", {}, elem => {
          elem.innerText = "No Such File";
        }));
      });
    }
  }

  function deleteSlot() {
    var iframe = this.iframe;

    if (this.plugin) this.viewer.view.destroy();
    this.viewer.remove();

    getViewer.map.delete(this);

    if (iframe) {
      if (lockedFrame === iframe) {
        mainContainer.unlock();
      } else {
        iframe.remove();
      }
    }
    if (!iframeWrapper.firstElementChild && lockedFrame) {
      lockedFrame = undefined;
      mainContainer.address = "";
      mainContainer.endFresh();
    }
  }

  function loadSlot() {
    this.loaded = true;
    this.contentWindow.addEventListener("keydown", keydownSlot);
    mainContainer.endFresh();
  }

  function keydownSlot(event) {
    var key = event.key?.toLowerCase();
    
    if (event.ctrlKey || event.metaKey)
      if (key === "s" || key === "r" || key === "e" || key === "d") event.preventDefault();
  }

  topNav.addEventListener("pageopened", event => {
    var page = event.detail, type = page.type;

    getViewer(page).then(viewer => {
      if (!editorWrapper.contains(viewer)) editorWrapper.append(viewer);

      if (
        type === "video" || 
        type === "audio" ||
        type === "image" ||
        type === "pdf" ||
        type === "zip" ||
        type === "exe" ||
        type === "binary"
      ) {
        editorWrapper.querySelector(".active")?.classList.remove("active");
        viewer.classList.add("active");
      } else if (viewer.classList.contains("error")) {
        editorWrapper.querySelector(".active")?.classList.remove("active");
        viewer.classList.add("active");
      } else {
        if (document.body.classList.contains("dark")) {
          if (!viewer.isDark) viewer.retheme?.(true);
        } else {
          if (viewer.isDark) viewer.retheme?.(false);
        }
        if (mainContainer.setting.minimap) viewer.toggleMinimap?.(true);
        else viewer.toggleMinimap?.(false);
        editorWrapper.querySelector(".active")?.classList.remove("active");
        viewer.classList.add("active");
        if (!sideNav.contains(document.activeElement)) setTimeout(() => {
          viewer.view?.focus();
        });
      }
      if (document.body.classList.contains("preview-off")) return;

      openFrame(page);
    });
  });
  topNav.addEventListener("pagesaved", event => {
    var page = event.detail, iframe;

    if (!page.plugin) return;
    if (page.type === "cpp" || page.type === "c") {
      let fileToCompile = page.path.slice(1);

      for (let fItem of page.file.parentNode.parentNode.body.children) {
        if (fItem.name.toLowerCase() === "main." + page.type) {
          fileToCompile = fItem.name;
          break;
        }
      }
      if (page.type === "cpp") termContainer.termWindow?.exec(`g++ ${fileToCompile}`);
      else if (page.type === "c") termContainer.termWindow?.exec(`gcc ${fileToCompile}`);
    } else if (page.type === "h") {
      for (let fItem of page.file.parentNode.parentNode.body.children) {
        let filename = fItem.name.toLowerCase()
        if (filename === "main.cpp")
          termContainer.termWindow?.exec(`g++ ${filename}`);
        else if (filename === "main.c")
          termContainer.termWindow?.exec(`gcc ${filename}`);
      }
    }
    if (document.body.classList.contains("preview-off")) return;
    if (lockedFrame) {
      refreshFrame();
    } else {
      iframe = page.iframe;
      iframe.src = page.path;
      iframe.loaded = false;
      mainContainer.startFresh();
      mainContainer.address = iframe.src;
    }
  });
  topNav.addEventListener("pageclosed", event => {
    var page = event.detail,
        viewer = getViewer.map.get(event.detail),
        iframe = page.iframe;

    if (viewer) viewer.remove();
    if (iframe && iframe !== lockedFrame) iframe.remove();
    if (!topNav.firstElementChild) {
      if (lockedFrame) {
        lockedFrame.remove();
        lockedFrame = undefined;
      }
      mainContainer.lockBtn.classList.remove("locked");
      mainContainer.address = "";
      mainContainer.endFresh();
      mainContainer.recordSetting({address: ""});
    }
  });
  topNav.addEventListener("pagedeleted", event => {
    if (!topNav.firstElementChild) {
      if (lockedFrame) {
        lockedFrame.remove();
        lockedFrame = undefined;
      }
      mainContainer.lockBtn.classList.remove("locked");
      mainContainer.address = "";
      mainContainer.endFresh();
      mainContainer.recordSetting({address: ""});
    }
  });

  mainContainer.refreshFrame = refreshFrame;

  let setting, lockedFrame;

  mainContainer.recordSetting = ({theme, preview, address, minimap} = {}) => {
    setting.theme = theme ?? setting.theme;
    setting.preview = preview ?? setting.preview;
    setting.address = address ?? setting.address;
    setting.minimap = minimap ?? setting.minimap;

    localStorage["--qr-setting"] = JSON.stringify(setting);
  };
  try {
    let address;

    setting = JSON.parse(localStorage["--qr-setting"]);
    address = setting.address;

    if (setting.theme) document.body.classList.add("dark");
    if (setting.preview) document.body.classList.add("preview-off");
    if (address) {
      mainContainer.address = address;
      mainContainer.lock();
    }
  } catch (error) {
    setting = {
      theme: true,
      preview: true,
      address: "",
      minimap: false
    }
    document.body.classList.add("dark");
    document.body.classList.add("preview-off");
  }
  mainContainer.setting = setting;

  editorContainer.append(editorPanel, editorWrapper);
  frameContainer.append(iframePanel, iframeWrapper);
  mainContainer.append(editorContainer, resizer, frameContainer);
  document.body.append(mainContainer);
  endCheck();
});
const termContainer = create("div", {class: "term-container"}, termContainer => {
  const termFrame = create("iframe", {class: "term-frame", src: "/xterm"}),
        resizer = create("qr-resizery", {}, resizer => {
          var startHeight = +localStorage["--bottom-height"];

          if (isNaN(startHeight) || startHeight < 8) {
            startHeight = 0;
            document.body.classList.add("terminal-off");
          } else termContainer.append(termFrame);

          document.body.style.setProperty("--bottom-height", startHeight + "px");

          resizer.addEventListener("resizestart", () => {
            startHeight = Number.parseFloat(document.body.style.getPropertyValue("--bottom-height"));
          });
          resizer.addEventListener("resize", event => {
            var newHeight = startHeight - event.detail;

            if (newHeight < 8) {
              if (newHeight < 0) newHeight = 0;
              else newHeight = 8;
            } else if (newHeight > 600) newHeight = 600;

            if (!newHeight) {
              if (!document.body.classList.contains("terminal-off"))
                document.body.classList.add("terminal-off");
            } else if (document.body.classList.contains("terminal-off"))
              document.body.classList.remove("terminal-off");

            document.body.style.setProperty("--bottom-height", newHeight + "px");
            localStorage["--bottom-height"] = newHeight;
          });
          resizer.addEventListener("resizeend", () => {
            if (document.body.classList.contains("terminal-off")) {
              if (termContainer.contains(termFrame)) {
                termFrame.remove();
                termContainer.termWindow = null;
              }
            } else if (!termContainer.contains(termFrame)) termContainer.append(termFrame);
          });
        });

  termContainer.prepend(resizer);

  termFrame.addEventListener("load", () => {
    termContainer.termWindow = termFrame.contentWindow;
  });

  document.body.append(termContainer);
});
const progress = create("div", {class: "progress-container"}, progress => {
  var title = create("div", {
    class: "progress-title"
  }),
      barTrack = create("div", {
        class: "progress-bar-track"
      }),
      bar = create("div", {
        class: "progress-bar"
      }), 
      leftBottom = create("div", {
        class: "progress-left-bottom"
      }), 
      speedSpan = create("span"),
      currentSize = create("span"),
      totalSize = create("span"),
      rightBottom = create("div", {
        class: "progress-right-bottom"
      }),
      countSpan = create("span"),
      numberSpan = create("span");

  title.innerText = "";
  speedSpan.innerText = "0 B";
  currentSize.innerText = "0 B";
  totalSize.innerText = "0 B";
  countSpan.innerText = "0";
  numberSpan.innerText = "0";

  bar.style.width = "0%";

  barTrack.append(bar);

  leftBottom.append(speedSpan, "/s - ", currentSize, " of ", totalSize);

  rightBottom.append(countSpan, " / ", numberSpan);

  progress.append(title, barTrack, leftBottom, rightBottom);

  var fileUploader = create("input", {type: "file", multiple: ""}),
      dirUploader = create("input", {
        type: "file",
        multiple: "",
        directory: "",
        webkitdirectory: "",
        mozdirectory: ""
      }),
      xhttp = new XMLHttpRequest,
      filesToUpload = [],
      count = 0,
      number = 0,
      prevLoad = 0,
      started = false,
      dirpath = "/",
      upload = Queue.syncCall((path, file, resolve, reject) => {
        xhttp.open("POST", "upload.jsp");
        xhttp.setRequestHeader("file-path", encodeURIComponent(path));
        xhttp.onload = () => {
          if (xhttp.status === 200) resolve(xhttp.response)
          else reject(xhttp.status + " " + xhttp.statusText);              
          currentSize.innerText = "0 B";
          bar.style.width = "0%";
          prevLoad = 0;
        };
        xhttp.onerror = error => {
          reject(error);
        };
        xhttp.ontimeout = () => {
          reject("timeout");
        };
        xhttp.upload.addEventListener("progress", event => {
          totalSize.innerText = sizeOf(event.total);
        }, {once: true});
        xhttp.upload.onprogress = event => {
          bar.style.width = (event.loaded / event.total * 100) + "%";
          currentSize.innerText = sizeOf(event.loaded);
          speedSpan.innerText = sizeOf(event.loaded - prevLoad);
          prevLoad = event.loaded;
        };
        xhttp.upload.onload = () => {
          bar.style.width = 100 + "%";
          currentSize.innerText = totalSize.innerText;
        };
        title.innerText = path;
        count++;
        countSpan.innerText = count;
        xhttp.send(file);
      });

  function sizeOf(value) {
    var i, units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    for (i = 0; value > 1024; i++, value /= 1024);

    return value.toFixed(1) + " " + units[i];
  }

  async function startUpload() {
    var entry;

    while (entry = filesToUpload.shift()) {
      try {
        let response = await upload(...entry);

        if (response !== "1") throw response;
      } catch (error) {
        dialog.alert(`<span style='color: red'>Error uploading files:</span>`, error);
      }
    }

    title.innerText = "";
    speedSpan.innerText = "0 B";
    totalSize.innerText = "0 B";
    countSpan.innerText = "0";
    numberSpan.innerText = "0";

    count = 0;
    number = 0;
    started = false;
    dirpath = "/";
    progress.remove();
  }

  fileUploader.addEventListener("change", () => {
    for (let file of fileUploader.files) {
      filesToUpload.push([dirpath + file.name, file]);
      number++;
    }

    numberSpan.innerText = number;

    if (!started) {
      startUpload();
      started = true;
      document.body.append(progress);
    }

    fileUploader.value = "";
  });
  dirUploader.addEventListener("change", () => {
    for (let file of dirUploader.files) {
      filesToUpload.push([dirpath + file.webkitRelativePath, file]);
      number++;
    }

    numberSpan.innerText = number;

    if (!started) {
      startUpload();
      started = true;
      document.body.append(progress);
    }

    dirUploader.value = "";
  });

  progress.uploadFile = path => {
    dirpath = path;
    fileUploader.click();
  };
  progress.uploadDir = path => {
    dirpath = path;
    dirUploader.click();
  };
  progress.upload = (files, path) => {
    for (let file of files) {
      filesToUpload.push([path + file.name, file]);
      number++;
    }
    numberSpan.innerText = number;
    if (!started) {
      startUpload();
      started = true;
      document.body.append(progress);
    }
  };
});
const dialog = create("qr-dialog", {}, dialog => document.body.append(dialog));
customElements.define("qr-dialog", class extends HTMLElement {
  connectedCallback() {
    if (this.rendered) return;
    var {title, message, input, buttons, ok, cancel} = this;
    var finalize = event => {
      if (event && this.contains(event.target)) return;
      window.removeEventListener("click", finalize, {capture: true});
      this.#resolve();
      if (!event) buttons.firstElementChild?.click();
      this.className = "off";
      input.onblur = null;
      ok.onblur = null;
      setTimeout(activeElement.focus.bind(activeElement));
    };
    var activeElement;
    var initialize = (ttl, msg) => {
      activeElement = document.activeElement;
      title.innerHTML = ttl;
      message.innerHTML = msg;
      input.value = msg;
      buttons.innerHTML = "";
      this.innerHTML = "";
      this.className = "off";
      requestAnimationFrame(() => this.className = "on");
    };
    this.alert = function (ttl = "", msg = "") {
      initialize(ttl, msg);
      buttons.append(ok);
      this.append(title, message, buttons);
      input.onblur = null;
      ok.onblur = ok.focus;
      ok.focus();
      return new Promise(resolve => {
        cancel.onclick = ok.onclick = () => resolve();
        this.#resolve = resolve.bind(null);
      }).finally(finalize);
    };
    this.confirm = function (ttl = "", msg = "") {
      initialize(ttl, msg, cancel, ok);
      buttons.append(cancel, ok);
      this.append(title, message, buttons);
      input.onblur = null;
      ok.onblur = ok.focus;
      ok.focus();
      return new Promise(resolve => {
        ok.onclick = () => resolve(true);
        cancel.onclick = () => resolve(false);
        this.#resolve = resolve.bind(null, false);
      }).finally(finalize);
    };
    this.prompt = function (ttl = "", msg = "") {
      initialize(ttl, msg, cancel, ok);
      buttons.append(cancel, ok);
      this.append(title, input, buttons);
      ok.onblur = null;
      input.onblur = input.focus;
      input.select();
      return new Promise(resolve => {
        ok.onclick = () => resolve(input.value);
        cancel.onclick = () => resolve(null);
        this.#resolve = resolve.bind(null, null);
      }).finally(finalize);
    };
    this.addEventListener("transitionend", event => {
      if (this.className === "off")
        this.className = "";
      else if (event.propertyName === "top" && this.className === "on")
        window.addEventListener("click", finalize, {capture: true});
    });
    input.onkeydown = event => {
      if (event.key === "Enter") ok.click();
      else if (event.key === "Escape") cancel.click();
    };
    ok.onkeydown = event => {
      if (event.key === "Enter") ok.click();
      else if (event.key === "Escape") cancel.click();
      return false;
    };
    this.rendered = true;
  }
  title = create("p", {class: "heading"});
  message = create("p", {class: "content"});
  input = create("input", {}, elem => elem.onkeypress = event => {
    if (event.key === "Enter") this.ok.click()
  });
  buttons = create("div");
  ok = create("button", {class: "ok"}, elem => elem.innerText = "Ok");
  cancel = create("button", {class: "cancel"}, elem => elem.innerText = "Cancel");
  rendered = false;
  #resolve;
});
customElements.define("qr-slidery", class extends HTMLElement {
  connectedCallback() {
    if (this.rendered) return;
    var slider = this.slider,
        thumb = this.thumb,
        shiftY, slideStart = event => {
          event.preventDefault();
          shiftY = event.clientY - thumb.getBoundingClientRect().top;
          thumb.setPointerCapture(event.pointerId);
          thumb.onpointermove = slide;
          this.dispatchEvent(new CustomEvent("slideStart"));
        }, slide = event => {
          let newTop = event.clientY - shiftY - slider.getBoundingClientRect().top,
              bottomEdge = slider.offsetHeight - thumb.offsetHeight;
          if (newTop < 0) newTop = 0;
          else if (newTop > bottomEdge) newTop = bottomEdge;
          thumb.style.top = newTop + "px";
          this.scrolling = true;
          this.dispatchEvent(new CustomEvent("slide", {
            detail: {
              slidedPortion: newTop / bottomEdge
            }
          }));
        };
    slider.className = "slider-trackY";
    slider.addEventListener("pointerdown", event => {
      if (event.target !== slider) return;
      let heigth = thumb.offsetHeight, bottomEdge = slider.offsetHeight - heigth,
          newTop = event.clientY - slider.getBoundingClientRect().top - heigth / 2;
      if (newTop < 0) newTop = 0;
      else if (newTop > bottomEdge) newTop = bottomEdge;
      thumb.style.top = newTop + "px";
      slideStart(event);
      this.dispatchEvent(new CustomEvent("slide", {
        detail: {
          slidedPortion: newTop / bottomEdge
        }
      }));
    });
    thumb.className = "slider-thumbY";
    thumb.onlostpointercapture = event => {
      thumb.onpointermove = null;
      this.scrolling = false;
      this.dispatchEvent(new CustomEvent("slideEnd"));
    };
    thumb.addEventListener("pointerdown", slideStart);
    thumb.ondragstart = () => false;
    slider.append(thumb);
    this.append(slider);
    this.addEventListener("update", event => {
      var portion = event.detail.slidedPortion, length = event.detail.length,
          maxHeight = slider.offsetHeight;
      if (portion > 1) portion = 1;
      else if (portion < 0) portion = 0;
      if (length < maxHeight) {
        if (length > 24) thumb.style.height = length + "px";
        else if (length === 0) {
          thumb.style.height = 0 + "px";
          this.style.visibility = "hidden";
        } else thumb.style.height = Math.min(maxHeight / 2, 24) + "px";
      } else {
        thumb.style.height = 0 + "px";
        this.style.visibility = "hidden";
      }
      var newTop = portion * (maxHeight - thumb.offsetHeight);
      thumb.style.top = newTop + "px";
    });
    this.scrolling = false;
    this.rendered = true;
    this.linkElement = elem => {
      var updateScroll = () => {
        if (elem.offsetHeight < this.offsetHeight) return this.style.visibility = "hidden";
        this.style.visibility = "";
        this.dispatchEvent(new CustomEvent("update", {
          detail: {
            slidedPortion: elem.scrollTop / (elem.scrollHeight - elem.clientHeight),
            length: elem.clientHeight / elem.scrollHeight * slider.offsetHeight
          }
        }));
      };
      elem.updateScroll = updateScroll;
      elem.addEventListener("scroll", elem.updateScroll);
      this.addEventListener("slide", event => {
        elem.scrollTop = event.detail.slidedPortion * (elem.scrollHeight - elem.clientHeight);
      });
      window.addEventListener("resize", elem.updateScroll);
      elem.updateScroll();
      if (!this.linkedElem) this.linkedElem = elem;
    };
    this.addEventListener("touchmove", event => {
      event.preventDefault();
    });
    if (this.linkedElem) this.linkElement(this.linkedElem);
  }
  slider = document.createElement("div");
  thumb = document.createElement("div");
  linkedElem;
  rendered = false;
});
customElements.define("qr-sliderx", class extends HTMLElement {
  connectedCallback() {
    if (this.rendered) return;
    var slider = this.slider,
        thumb = this.thumb,
        shiftX, slideStart = event => {
          event.preventDefault();
          shiftX = event.clientX - thumb.getBoundingClientRect().left;
          thumb.setPointerCapture(event.pointerId);
          thumb.onpointermove = slide;
          this.dispatchEvent(new CustomEvent("slideStart"));
        }, slide = event => {
          let newLeft = event.clientX - shiftX - slider.getBoundingClientRect().left,
              rightEdge = slider.offsetWidth - thumb.offsetWidth;
          if (newLeft < 0) newLeft = 0;
          else if (newLeft > rightEdge) newLeft = rightEdge;
          thumb.style.left = newLeft + "px";
          this.scrolling = true;
          this.dispatchEvent(new CustomEvent("slide", {
            detail: {
              slidedPortion: newLeft / rightEdge
            }
          }));
        };
    slider.className = "slider-trackX";
    slider.addEventListener("pointerdown", event => {
      if (event.target !== slider) return;
      let heigth = thumb.offsetWidth, rightEdge = slider.offsetWidth - heigth,
          newLeft = event.clientX - slider.getBoundingClientRect().left - heigth / 2;
      if (newLeft < 0) newLeft = 0;
      else if (newLeft > rightEdge) newLeft = rightEdge;
      thumb.style.left = newLeft + "px";
      slideStart(event);
      this.dispatchEvent(new CustomEvent("slide", {
        detail: {
          slidedPortion: newLeft / rightEdge
        }
      }));
    });
    thumb.className = "slider-thumbX";
    thumb.onlostpointercapture = event => {
      thumb.onpointermove = null;
      this.scrolling = false;
      this.dispatchEvent(new CustomEvent("slideEnd"));
    };
    thumb.addEventListener("pointerdown", slideStart);
    thumb.ondragstart = () => false;
    slider.append(thumb);
    this.append(slider);
    this.addEventListener("update", event => {
      var portion = event.detail.slidedPortion, length = event.detail.length,
          maxWidth = slider.offsetWidth;
      if (portion > 1) portion = 1;
      else if (portion < 0) portion = 0;
      if (length < maxWidth) {
        if (length > 24) thumb.style.width = length + "px";
        else if (length === 0) {
          thumb.style.width = 0 + "px";
          this.style.visibility = "hidden";
        } else thumb.style.width = Math.min(maxWidth / 2, 24) + "px";
      } else {
        thumb.style.width = 0 + "px";
        this.style.visibility = "hidden";
      }
      var newLeft = portion * (maxWidth - thumb.offsetWidth);
      thumb.style.left = newLeft + "px";
    });
    this.scrolling = false;
    this.rendered = true;
    this.linkElement = elem => {
      var updateScroll = () => {
        if (elem.offsetWidth < this.offsetWidth)
          return this.style.visibility = "hidden";
        this.style.visibility = "";
        this.dispatchEvent(new CustomEvent("update", {
          detail: {
            slidedPortion: elem.scrollLeft / (elem.scrollWidth - elem.clientWidth),
            length: elem.clientWidth / elem.scrollWidth * slider.offsetWidth
          }
        }));
      };
      elem.updateScroll = updateScroll;
      elem.addEventListener("scroll", elem.updateScroll);
      this.addEventListener("slide", event => {
        elem.scrollLeft = event.detail.slidedPortion * (elem.scrollWidth - elem.clientWidth);
      });
      window.addEventListener("resize", elem.updateScroll);
      elem.updateScroll();
      if (!this.linkedElem) this.linkedElem = elem;
    };
    this.addEventListener("touchmove", event => {
      event.preventDefault();
    });
    if (this.linkedElem) this.linkElement(this.linkedElem);
  }
  slider = document.createElement("div");
  thumb = document.createElement("div");
  rendered = false;
});
if (CHROMIUM) {
  customElements.define("qr-resizerx", class extends HTMLElement {
    connectedCallback() {
      if (this.rendered) return;
      var initX, pointermove = event => {
        this.dispatchEvent(new CustomEvent("resize", {
          detail: event.clientX - initX
        }));
      };
      this.addEventListener("pointerdown", event => {
        event.preventDefault();
        this.classList.add("resize");
        this.setPointerCapture(event.pointerId);
        this.addEventListener("pointermove", pointermove);
        this.dispatchEvent(new CustomEvent("resizestart"));
      });
      this.addEventListener("gotpointercapture", event => {
        initX = event.clientX;
      });
      this.addEventListener("lostpointercapture", () => {
        this.classList.remove("resize");
        this.removeEventListener("pointermove", pointermove);
        this.dispatchEvent(new CustomEvent("resizeend"));
      });
      this.addEventListener("touchmove", event => {
        event.preventDefault();
      });
      this.rendered = true;
    }
    rendered = false;
  });
  customElements.define("qr-resizery", class extends HTMLElement {
    connectedCallback() {
      if (this.rendered) return;
      var initY, pointermove = event => {
        this.dispatchEvent(new CustomEvent("resize", {
          detail: event.clientY - initY
        }));
      };
      this.addEventListener("pointerdown", event => {
        event.preventDefault();
        this.classList.add("resize");
        this.setPointerCapture(event.pointerId);
        this.addEventListener("pointermove", pointermove);
        this.dispatchEvent(new CustomEvent("resizestart"));
      });
      this.addEventListener("gotpointercapture", event => {
        initY = event.clientY;
      });
      this.addEventListener("lostpointercapture", () => {
        this.classList.remove("resize");
        this.removeEventListener("pointermove", pointermove);
        this.dispatchEvent(new CustomEvent("resizeend"));
      });
      this.addEventListener("touchmove", event => {
        event.preventDefault();
      });
      this.rendered = true;
    }
    rendered = false;
  });
} else {
  create("div", {class: "overlay"}, overlay => {
    customElements.define("qr-resizerx", class extends HTMLElement {
      connectedCallback() {
        if (this.rendered) return;
        var initX, mousemove = event => {
          this.dispatchEvent(new CustomEvent("resize", {
            detail: event.clientX - initX
          }));
        }, mouseup = event => {
          this.classList.remove("resize");
          overlay.classList.remove("h-resize");
          document.documentElement.removeEventListener("mousemove", mousemove);
          document.documentElement.removeEventListener("mouseup", mouseup);
          this.dispatchEvent(new CustomEvent("resizeend"));
        };
        this.addEventListener("mousedown", event => {
          event.preventDefault();
          initX = event.clientX;
          this.classList.add("resize");
          overlay.classList.add("h-resize");
          document.documentElement.addEventListener("mousemove", mousemove);
          document.documentElement.addEventListener("mouseup", mouseup);
          this.dispatchEvent(new CustomEvent("resizestart"));
        });
        this.rendered = true;
      }
      rendered = false;
    });
    customElements.define("qr-resizery", class extends HTMLElement {
      connectedCallback() {
        if (this.rendered) return;
        var initY, mousemove = event => {
          this.dispatchEvent(new CustomEvent("resize", {
            detail: event.clientY - initY
          }));
        }, mouseup = event => {
          this.classList.remove("resize");
          overlay.classList.remove("v-resize");
          document.documentElement.removeEventListener("mousemove", mousemove);
          document.documentElement.removeEventListener("mouseup", mouseup);
          this.dispatchEvent(new CustomEvent("resizeend"));
        };
        this.addEventListener("mousedown", event => {
          event.preventDefault();
          initY = event.clientY;
          this.classList.add("resize");
          overlay.classList.add("v-resize");
          document.documentElement.addEventListener("mousemove", mousemove);
          document.documentElement.addEventListener("mouseup", mouseup);
          this.dispatchEvent(new CustomEvent("resizestart"));
        });
        this.rendered = true;
      }
      rendered = false;
    });
    document.body.append(overlay);
  });
}
customElements.define("qr-folder", qrFolder);
customElements.define("qr-file", qrFile);
customElements.define("qr-page", qrPage);
