#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');
const pc = require('picocolors');
const { JSDOM } = require('jsdom');
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

// --- MathJax Initialization ---
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svg = new SVG({ fontCache: 'local' });
const mjPage = mathjax.document('', { InputJax: tex, OutputJax: svg });

const blogRoot = '/Users/ntalbs/Blog';
const publicDir = 'public';
const targetDir = 'rendered-public';
const cacheFile = path.join(blogRoot, targetDir, 'math-cache.json');
const silent = true; // print only RENDER message
const stat = {
  directories: 0,
  rendered: 0,
  copied: 0,
  skipped: 0
};

const files = glob.sync(`${blogRoot}/${publicDir}/**/*`);

console.log(pc.yellow(`> Found ${files.length} files to process. Start processing ...`));

let cache = {};
if (fs.existsSync(cacheFile)) {
  cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
}

files.forEach(f => process(f));

fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

stat.total = stat.directories + stat.rendered + stat.copied + stat.skipped;
console.log(pc.bold(pc.yellow('> Completed.')), stat);



function process(sourcePath) {
  let targetPath = getTargetPathFrom(sourcePath);

  let sourcePathStat = fs.statSync(sourcePath);
  if (sourcePathStat.isDirectory()) {
    ensureDir(targetPath);
    stat.directories++;
  } else {
    if (sourcePath.endsWith('.md5')) {
      return;
    }

    if (isSrcNotChanged(sourcePath)) {
      stat.skipped ++;
      if (!silent) {
        console.log(pc.bold(pc.green('SKIP:')), targetPath);
      }
      return;
    }

    ensureDir(path.dirname(targetPath));
    if (sourcePath.endsWith('.html')) {
      processHtml(sourcePath, targetPath);
    } else {
      stat.copied++;
      if (!silent) {
        console.log(pc.bold(pc.yellow('COPY:')), sourcePath);
      }
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function isSrcNotChanged(src) {
  let newMd5 = md5(src);
  let same = cache[src] === newMd5;
  if (!same) {
    cache[src] = newMd5;
  }
  return same;
}

function md5(src) {
  let content = fs.readFileSync(src)
  return crypto.createHash('md5').update(content).digest('hex');
}

function processHtml(sourcePath, targetPath) {
  const html = fs.readFileSync(sourcePath, 'utf8');
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const body = document.body;
  let needsUpdate = false;

  processNode(body);

  if (needsUpdate) {
    // Add the required MathJax CSS to the <head>
    const styleTag = document.createElement('style');
    styleTag.setAttribute('id', 'MJX-SVG-styles');
    styleTag.innerHTML = adaptor.innerHTML(svg.styleSheet(mjPage));
    document.head.appendChild(styleTag);
    fs.writeFileSync(targetPath, dom.serialize());
    stat.rendered++;
    console.log(pc.bold(pc.red('RENDER:')), sourcePath);
  } else {
    fs.copyFileSync(sourcePath, targetPath);
    stat.copied++;
    if (!silent) {
      console.log(pc.bold(pc.yellow('COPY:')), sourcePath);
    }
  }

  function processNode(node) {
    // Regex for $$...$$ and $...$
    const displayRegex = /\$\$(.*?)\$\$/gs;
    const inlineRegex = /(?<!\\)\$([^\$]+?)\$/g;

    if (node.nodeType === 3) { // Text node
      let text = node.textContent;
      if (displayRegex.test(text) || inlineRegex.test(text)) {
        needsUpdate = true;

        // Render Display Math
        text = text.replace(displayRegex, (_, texStr) => {
          const output = mjPage.convert(texStr, { display: true });
          const svg = adaptor.innerHTML(output);
          return `<mjx-container display="true" style="display: block; text-align: center; margin: 1em 0;">${svg}</mjx-container>`;
        });

        // Render Inline Math
        text = text.replace(inlineRegex, (_, texStr) => {
          const output = mjPage.convert(texStr, { display: false });
          return adaptor.innerHTML(output);
        });

        // Create a temporary container to hold the new HTML
        const wrapper = document.createElement('div');
        wrapper.innerHTML = text;
        node.replaceWith(...wrapper.childNodes);
      }
    } else if (node.className === 'latex-block') { // div.latex-block by org-mode
      needsUpdate = true;

      let texStr = node.textContent;

      // Render Display Math
      const output = mjPage.convert(texStr, { display: true });
      const svg = adaptor.innerHTML(output);
      let text = `<mjx-container display="true" style="display: block; text-align: center; margin: 1em 0;">${svg}</mjx-container>`;

      // Create a temporary container to hold the new HTML
      const wrapper = document.createElement('div');
      wrapper.innerHTML = text;
      node.replaceWith(...wrapper.childNodes);
    } else if (node.nodeName !== 'SCRIPT' && node.nodeName !== 'CODE' && node.nodeName !== 'PRE') {
      // Recursively check children, skipping code blocks
      Array.from(node.childNodes).forEach(processNode);
    }
  }
}

function getTargetPathFrom(sourcePath) {
  return sourcePath.replace(publicDir, targetDir);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
