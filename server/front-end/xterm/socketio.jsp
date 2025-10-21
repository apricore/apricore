if (req.headers.upgrade?.toLowerCase() === 'websocket' &&
    req.headers.connection.match(/\bupgrade\b/i) && 
    req.headers["sec-websocket-key"]) {
  const wss = new (new require("ws")).WebSocketServer({noServer: true});
  wss.handleUpgrade(req, req.socket, Buffer.alloc(0), function (ws) {
    var shell = process.platform === "win32" ? "powershell.exe" : "bash";
    var ptyProcess = require("node-pty").spawn(shell, [], {
      name: "xterm-color",
      cwd: wwwroot,
      env: process.env
    });
    ptyProcess.write("clear\r");
    ptyProcess.on("data", function (data) {
      ws.send(data);
    });
    ws.on("message", function (message) {
      if (message[0] === 123 && message[1] === 34) try {
        let msgObj = JSON.parse(message);
        ptyProcess.resize(msgObj.cols, msgObj.rows);
        return;
      } catch (err) {
      }
      ptyProcess.write(message);
    });
    ws.on("close", function (code, message) {
      require('tree-kill')(ptyProcess._pid, 'SIGKILL', err => {});
      ptyProcess.end();
      res.end();
    });
  });
  flush = false;
}
