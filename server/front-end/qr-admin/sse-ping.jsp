var code = Storage.set(res);

res.writeHead(200, {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache'
});
res.write("event: connected\n" + "data: " + code + "\n\n");
res.onfinish = (err, res) => {
  Storage.remove(code);
};

flush = false;