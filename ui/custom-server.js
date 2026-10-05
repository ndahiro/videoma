const { configureRuntimeEnv } = require('next-runtime-env/build/configure');
configureRuntimeEnv();

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({
  hostname,
  port,
  dir: process.env.NEXT_STANDALONE_DIR || process.cwd(),
});

const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, hostname, () => {
    console.log(`Server listening on http://${hostname}:${port}`);
  });
});
