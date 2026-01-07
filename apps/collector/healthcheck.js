const http = require('http');

const options = {
  host: '0.0.0.0',
  port: process.env.PORT || 3001,
  path: '/api/devices',
  timeout: 5000,
};

const request = http.request(options, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});

request.on('error', () => {
  process.exit(1);
});

request.end();
