const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveFile } = require('./serve-web');

describe('resolveFile', () => {
  let root;

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'serve-web-')));
    fs.mkdirSync(path.join(root, '_expo'));
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(root, '_expo', 'app.js'), '');
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it.each(['/', '/orders', '/orders/7', '/orders/7?confirmed=1', '/reports/'])('serves index.html for route %s', (url) => {
    expect(resolveFile(root, url)).toBe(path.join(root, 'index.html'));
  });

  it('serves existing assets', () => {
    expect(resolveFile(root, '/_expo/app.js')).toBe(path.join(root, '_expo', 'app.js'));
  });

  it.each(['/_expo/missing.js', '/favicon.ico'])('returns null for missing asset %s', (url) => {
    expect(resolveFile(root, url)).toBeNull();
  });

  it.each(['/../package.json', '/%2e%2e/package.json', '/_expo/../../secret.txt', '/%E0%A4%A'])(
    'never resolves outside the root or malformed paths: %s',
    (url) => {
      expect(resolveFile(root, url)).toBeNull();
    }
  );
});
