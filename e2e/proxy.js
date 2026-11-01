// Local stand-in for the hosting proxy (Hostinger): run the app with `next start -H 0.0.0.0 -p 3001`,
// then `node e2e/proxy.js` and point the E2E scripts at BASE_URL=http://localhost:4000.
// Minimal reverse proxy like Hostinger's: public port 4000 → app on 0.0.0.0:3001
const http = require("http");
http.createServer((req, res) => {
  const p = http.request({ host: "127.0.0.1", port: 3001, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-host": req.headers.host, "x-forwarded-proto": "http" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(p);
}).listen(4000);
