const fs = require('fs');
const express = require('express');
const proxy = require('http-proxy-middleware');
const { Client } = require('mongodb-promise');

const dotenv = require('dotenv');
dotenv.config();
require('./promise-setup');
require('logger');

const configFile = process.env.CONFIG || process.argv[2] || 'config.json';
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
logger.info('reading settings from', configFile);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { routes } = config;
const router = (req) => {
  const source = req.url;
  const target = routes.find(r => source.startsWith(r.from));
  return target && target.to;
};

const pathRewrite = routes.reduce((hash, r) => {
  hash[`^${r.from}`] = '';
  return hash;
}, {});

const onProxyRes = (proxyRes, req, res) => {
  let body = '';
  proxyRes.on('data', (chunk) => {
    body += chunk;
  });
  proxyRes.on('end', () => {
    const { originalUrl, client, method } = req;
    const { headers, statusCode } = proxyRes;
    if (statusCode !== 200) {
      logger.debug(method, originalUrl, statusCode, '~> NO CACHE');
      return;
    }
    logger.debug(method, originalUrl, '~> CACHED');
    client.insert('cache', {
      url: originalUrl,
      headers,
      body,
    }).catch(err => {
      console.error('error storing cache', err);
      res.json({ error: err.toString() });
    });
  });
};

const routingProxy = proxy({
  target: 'http://localhost:8000',
  secure: false,
  hostRewrite: true,
  pathRewrite,
  router,
  onProxyRes,
  // logLevel: 'debug',
});

const app = express();
const cache = {};

app.use((req, res, next) => {
  const client = new Client();
  client.init().then(_ => {
    req.client = client;
    next();
  }).catch(err => {
    logger.error('error opening MongoDB connection', err);
    res.json({ error: err.toString() });
  });
});

app.use((req, res, next) => {
  const { client } = req;
  const { url, method, headers } = req;

  if (method !== 'GET') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      logger.debug(method, url, '~> STORING REQUEST');
      client.insert('requests', { url, method, headers, body });
    });
  }

  client.query('cache').find({ url }).execute().then(results => {
    logger.debug(method, url, '~>', results.length ? 'HIT' : 'MISS');
    if (results.length) {
      const { headers, body } = results[0];
      Object.keys(headers).forEach(header => res.setHeader(header, headers[header]));
      return res.send(body);
    }
    req.originalUrl = url;
    next();
  }).catch(err => {
    logger.error('error reading cache', err);
    res.json({ error: err.toString() });
  });
});

app.use(routingProxy);

const port = config.port || process.env.port || 8083;
app.listen(port);
logger.info('server up ~>', port);
