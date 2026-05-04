const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

async function fetchJson(url, options) {
  const https = require('https');
  const http = require('http');
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function uploadImage(imageBuffer, apiKey) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.replicate.com',
      path: '/v1/files',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(imageBuffer);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve index.html
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { action, apiKey, input, predId, imageBase64 } = JSON.parse(body);

        if (action === 'upload') {
          const buf = Buffer.from(imageBase64, 'base64');
          const result = await uploadImage(buf, apiKey);
          res.writeHead(200);
          res.end(JSON.stringify(result));
          return;
        }

        if (action === 'predict') {
          const result = await fetchJson('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
              input
            })
          });
          res.writeHead(200);
          res.end(JSON.stringify(result.body));
          return;
        }

        if (action === 'poll') {
          const result = await fetchJson('https://api.replicate.com/v1/predictions/' + predId, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey }
          });
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

server.listen(PORT, () => console.log('Server running on port ' + PORT));
