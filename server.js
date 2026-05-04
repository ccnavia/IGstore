const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function httpsRequest(url, options, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch(e) { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  if (req.method === 'POST' && req.url === '/api') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const body = Buffer.concat(chunks).toString();
        const payload = JSON.parse(body);
        const { action, apiKey, input, predId, imageBase64 } = payload;

        if (action === 'upload') {
          if (!imageBase64 || imageBase64.length === 0) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'imageBase64 is empty' }));
            return;
          }
          const buf = Buffer.from(imageBase64, 'base64');
          const result = await httpsRequest(
            'https://api.replicate.com/v1/files',
            {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'image/jpeg',
                'Content-Length': buf.length
              }
            },
            buf
          );
          res.writeHead(200);
          res.end(JSON.stringify(result.body));
          return;
        }

        if (action === 'predict') {
          const bodyStr = JSON.stringify({
            version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
            input
          });
          const result = await httpsRequest(
            'https://api.replicate.com/v1/predictions',
            {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
              }
            },
            bodyStr
          );
          res.writeHead(200);
          res.end(JSON.stringify(result.body));
          return;
        }

        if (action === 'poll') {
          const result = await httpsRequest(
            'https://api.replicate.com/v1/predictions/' + predId,
            {
              method: 'GET',
              headers: { 'Authorization': 'Bearer ' + apiKey }
            }
          );
          res.writeHead(200);
          res.end(JSON.stringify(result.body));
          return;
        }

        res.writeHead(400);
        res.end(JSON.stringify({ error: 'bad action' }));

      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => console.log('Server on port ' + PORT));
