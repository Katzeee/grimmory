import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const hostFlag = args.indexOf('--host');
if (hostFlag >= 0 && !args[hostFlag + 1]) throw new Error('--host requires an address');
const bindHost = hostFlag >= 0 ? args[hostFlag + 1] : '127.0.0.1';
const browserHost = bindHost === '0.0.0.0' ? '127.0.0.1' : bindHost;
const apiPort = 6060;
const uiPort = 4200;
const readerUrl = `http://${browserHost}:${uiPort}/ebook-reader/book/1`;
const loginUrl = `http://${browserHost}:${uiPort}/login`;

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: pnpm run folio:dev -- [--book path/to/book.epub] [--host address]\n\nStarts the real Angular Folio reader against a local, ephemeral mock API.\nUse --host 0.0.0.0 to test from another device on the local network.\nLog in with any non-empty username and password, then open:\n${readerUrl}`);
  process.exit(0);
}

const bookFlag = args.indexOf('--book');
if (bookFlag >= 0 && !args[bookFlag + 1]) {
  throw new Error('--book requires a path to an EPUB file');
}

const suppliedBookPath = bookFlag >= 0 ? resolve(args[bookFlag + 1]) : null;
const bookBytes = suppliedBookPath ? await loadEpub(suppliedBookPath) : createSampleEpub();
const fileName = suppliedBookPath ? basename(suppliedBookPath) : 'folio-layout-lab.epub';
const bookTitle = suppliedBookPath ? basename(fileName, '.epub') : 'Folio 排版实验书';

const state = {
  nextId: 1,
  bookmarks: [],
  annotations: [],
  notes: [],
  viewerSetting: {ebookSettings: null},
  progress: null,
};

const server = createServer(async (request, response) => {
  try {
    await handleRequest(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {message: error instanceof Error ? error.message : String(error)});
  }
});

await listen(server, apiPort, bindHost);

const angular = spawn(
  process.execPath,
  [resolve(import.meta.dirname, '../node_modules/@angular/cli/bin/ng.js'), 'serve', '--host', bindHost, '--port', String(uiPort), '--configuration', 'development'],
  {cwd: resolve(import.meta.dirname, '..'), stdio: 'inherit'}
);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  angular.kill('SIGINT');
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
angular.on('exit', code => {
  server.close();
  process.exitCode = code ?? 0;
});

try {
  await waitForUrl(loginUrl, 180_000);
  console.log(`\nFolio lab is ready.\n1. Open ${loginUrl}\n2. Log in with any non-empty username and password.\n3. Open ${readerUrl}\n\nThe mock API is ephemeral; stop both servers with Ctrl+C.\n`);
} catch (error) {
  stop();
  throw error;
}

async function handleRequest(request, response) {
  setCorsHeaders(response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${browserHost}:${apiPort}`);
  const {pathname} = url;
  const method = request.method ?? 'GET';

  if (pathname === '/api/public/settings' && method === 'HEAD') return sendEmpty(response);
  if (pathname === '/api/v1/setup/status' && method === 'GET') return sendJson(response, 200, {data: true});
  if (pathname === '/api/v1/public-settings' && method === 'GET') return sendJson(response, 200, publicSettings());
  if (pathname === '/api/v1/settings' && method === 'GET') return sendJson(response, 200, appSettings());

  if (pathname === '/api/v1/auth/login' && method === 'POST') {
    const credentials = await readJson(request);
    if (!credentials?.username || !credentials?.password) return sendJson(response, 400, {message: 'Enter any username and password'});
    return sendJson(response, 200, tokenResponse());
  }
  if (pathname === '/api/v1/auth/refresh' && method === 'POST') return sendJson(response, 200, tokenResponse());
  if (pathname === '/api/v1/auth/logout' && method === 'POST') return sendJson(response, 200, {logoutUrl: null});
  if (pathname === '/api/v1/users/me' && method === 'GET') return sendJson(response, 200, testUser());

  if (pathname === '/api/v1/books/1' && method === 'GET') return sendJson(response, 200, testBook());
  if (pathname === '/api/v1/books/1/content' && method === 'GET') {
    response.writeHead(200, {
      'content-type': 'application/epub+zip',
      'content-length': bookBytes.length,
      'content-disposition': `inline; filename="${fileName.replaceAll('"', '')}"`,
    });
    response.end(bookBytes);
    return;
  }
  if (pathname === '/api/v1/books/1/viewer-setting' && method === 'GET') return sendJson(response, 200, state.viewerSetting);
  if (pathname === '/api/v1/books/1/viewer-setting' && method === 'PUT') {
    state.viewerSetting = await readJson(request);
    return sendEmpty(response);
  }
  if (pathname === '/api/v1/books/progress' && method === 'POST') {
    state.progress = await readJson(request);
    return sendEmpty(response);
  }

  if (pathname === '/api/v1/bookmarks/book/1' && method === 'GET') return sendJson(response, 200, state.bookmarks);
  if (pathname === '/api/v1/bookmarks' && method === 'POST') return createItem(request, response, state.bookmarks);
  if (pathname.startsWith('/api/v1/bookmarks/') && method === 'DELETE') return deleteItem(response, state.bookmarks, pathname);

  if (pathname === '/api/v1/annotations/book/1' && method === 'GET') return sendJson(response, 200, state.annotations);
  if (pathname === '/api/v1/annotations' && method === 'POST') return createItem(request, response, state.annotations);
  if (pathname.startsWith('/api/v1/annotations/') && method === 'DELETE') return deleteItem(response, state.annotations, pathname);

  if (pathname === '/api/v2/book-notes/book/1' && method === 'GET') return sendJson(response, 200, state.notes);
  if (pathname === '/api/v2/book-notes' && method === 'POST') return createItem(request, response, state.notes);
  if (pathname.startsWith('/api/v2/book-notes/') && method === 'DELETE') return deleteItem(response, state.notes, pathname);

  if (pathname === '/api/v1/media/book/1/thumbnail' && method === 'GET') return sendCover(response);
  if (pathname === '/api/v1/books' && method === 'GET') return sendJson(response, 200, [testBook()]);
  if ((pathname === '/api/v1/libraries' || pathname === '/api/v1/shelves' || pathname === '/api/magic-shelves') && method === 'GET') {
    return sendJson(response, 200, []);
  }

  if (pathname.startsWith('/api/') && method === 'GET') return sendJson(response, 200, []);
  if (pathname.startsWith('/api/')) return sendEmpty(response);
  sendJson(response, 404, {message: `No mock route for ${method} ${pathname}`});
}

async function createItem(request, response, collection) {
  const now = new Date().toISOString();
  const item = {...await readJson(request), id: state.nextId++, userId: 1, createdAt: now, updatedAt: now};
  collection.push(item);
  sendJson(response, 200, item);
}

function deleteItem(response, collection, pathname) {
  const id = Number(pathname.split('/').at(-1));
  const index = collection.findIndex(item => item.id === id);
  if (index >= 0) collection.splice(index, 1);
  sendEmpty(response);
}

function testBook() {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Folio Lab',
    fileName,
    fileSizeKb: Math.ceil(bookBytes.length / 1024),
    primaryFile: {
      id: 11,
      bookId: 1,
      bookType: 'EPUB',
      extension: 'epub',
      fileName,
      filePath: `/folio-lab/${fileName}`,
      fileSizeKb: Math.ceil(bookBytes.length / 1024),
    },
    metadata: {
      bookId: 1,
      title: bookTitle,
      subtitle: suppliedBookPath ? '本地 EPUB' : '横排、竖排与移动端测试',
      authors: ['Folio Lab'],
      publisher: 'Grimmory development',
      language: 'zh',
      pageCount: 120,
      coverUpdatedOn: 'folio-lab',
      description: 'Local synthetic book for Folio layout and interaction development.',
    },
    readStatus: 'READING',
    addedOn: '2026-01-01T00:00:00.000Z',
    epubProgress: state.progress?.epubProgress ?? undefined,
    shelves: [],
    alternativeFormats: [],
    supplementaryFiles: [],
  };
}

function testUser() {
  return {
    id: 1,
    username: 'folio-lab',
    name: 'Folio Lab',
    email: 'folio@example.invalid',
    locale: 'zh_CN',
    theme: 'DARK',
    themeSyncEnabled: false,
    uiFont: null,
    assignedLibraries: [{id: 1, name: 'Folio Lab'}],
    permissions: {
      admin: true,
      canManageLibrary: true,
      canUpload: true,
      canAccessBookdrop: true,
      canAccessLibraryStats: true,
      canAccessUserStats: true,
      canManageGlobalPreferences: true,
      demoUser: false,
    },
    userSettings: {},
  };
}

function publicSettings() {
  return {oidcEnabled: false, remoteAuthEnabled: false, oidcProviderDetails: null, oidcForceOnlyMode: false};
}

function appSettings() {
  return {
    ...publicSettings(),
    opdsServerEnabled: false,
    komgaApiEnabled: false,
    metadataProviderSettings: {},
    metadataMatchWeights: {},
    maxFileUploadSizeInMb: 128,
  };
}

function tokenResponse() {
  const header = Buffer.from(JSON.stringify({alg: 'none', typ: 'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({exp: 4_102_444_800, sub: '1'})).toString('base64url');
  return {accessToken: `${header}.${payload}.`, refreshToken: 'folio-lab', expires: 86_400, isDefaultPassword: false};
}

function setCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'authorization, content-type');
  response.setHeader('access-control-allow-methods', 'DELETE, GET, HEAD, OPTIONS, POST, PUT');
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {'content-type': 'application/json', 'content-length': body.length});
  response.end(body);
}

function sendEmpty(response) {
  response.writeHead(204).end();
}

function sendCover(response) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#171717"/><rect x="42" y="42" width="516" height="816" rx="24" fill="none" stroke="#bc874e" stroke-width="4"/><text x="300" y="360" fill="#bc874e" font-family="serif" font-size="76" text-anchor="middle">FOLIO</text><text x="300" y="455" fill="#eee8df" font-family="sans-serif" font-size="42" text-anchor="middle">排版实验书</text><text x="300" y="520" fill="#aaa49c" font-family="sans-serif" font-size="26" text-anchor="middle">Grimmory</text></svg>`;
  response.writeHead(200, {'content-type': 'image/svg+xml; charset=utf-8'});
  response.end(svg);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function loadEpub(path) {
  const info = await stat(path);
  if (!info.isFile() || !path.toLowerCase().endsWith('.epub')) throw new Error(`Not an EPUB file: ${path}`);
  return readFile(path);
}

function listen(httpServer, port, address) {
  return new Promise((resolveListen, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, address, resolveListen);
  });
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Angular is still compiling.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createSampleEpub() {
  const chapters = Array.from({length: 12}, (_, index) => {
    const number = index + 1;
    const vertical = number % 3 === 0;
    const paragraphs = Array.from({length: 34}, (__, paragraph) =>
      `<p>第${number}章第${paragraph + 1}段。阅读器需要在窄屏、宽屏、分页与滚动模式之间保持稳定。` +
      '春はあけぼの。やうやう白くなりゆく山ぎは、すこしあかりて、紫だちたる雲のほそくたなびきたる。' +
      'Typography should remain comfortable when direction, spacing, alignment, and font settings change.</p>'
    ).join('');
    return {
      path: `EPUB/chapter-${number}.xhtml`,
      href: `chapter-${number}.xhtml`,
      title: `${vertical ? '竖排' : '横排'}测试 ${number}`,
      body: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh"><head><title>第${number}章</title><link rel="stylesheet" href="style.css"/></head><body${vertical ? ' class="vertical"' : ''}><h1>第${number}章 · ${vertical ? '竖排' : '横排'}测试</h1>${paragraphs}</body></html>`,
    };
  });

  const manifest = chapters.map((chapter, index) => `<item id="chapter-${index + 1}" href="${chapter.href}" media-type="application/xhtml+xml"/>`).join('');
  const spine = chapters.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join('');
  const nav = chapters.map(chapter => `<li><a href="${chapter.href}">${chapter.title}</a></li>`).join('');

  return createStoredZip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['EPUB/package.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="zh"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">folio-layout-lab</dc:identifier><dc:title>Folio 排版实验书</dc:title><dc:creator>Folio Lab</dc:creator><dc:language>zh</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${manifest}</manifest><spine>${spine}</spine></package>`],
    ['EPUB/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh"><head><title>目录</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${nav}</ol></nav></body></html>`],
    ['EPUB/style.css', 'html,body{margin:0;padding:0}body{font-family:serif;line-height:1.8;padding:1em}h1{margin-block:1em 2em}p{text-indent:2em;margin-block:0 1em}.vertical{writing-mode:vertical-rl;text-orientation:mixed}'],
    ...chapters.map(chapter => [chapter.path, chapter.body]),
  ]);
}

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
