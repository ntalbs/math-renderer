import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import chalk from 'chalk';
import { JSDOM } from 'jsdom';

// MathJax imports
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

export function render(src, target, options) {
  // --- MathJax Initialization ---
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: AllPackages });
  const svg = new SVG({ fontCache: 'local' });
  const mjPage = mathjax.document('', { InputJax: tex, OutputJax: svg });

  const cacheFile = path.join(target, 'math-cache.json');
  let cache = readCacheFile(cacheFile);

  const stat = {
    directories: 0,
    rendered: 0,
    copied: 0,
    skipped: 0,
    total: 0
  };


  const files = glob.sync(`${src}/**/*`);

  console.log(chalk.yellow.bold('> Start processing:'), `Found ${files.length} files ...`);
  files.forEach(f => process(f));
  console.log(chalk.green.bold('> Completed.'), stat);

  writeCacheFile(cacheFile);


  // -- internal functions --

  function readCacheFile(cacheFile) {
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      return {}
    }
  }

  function writeCacheFile(cacheFile) {
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  function process(sourcePath) {
    let targetPath = getTargetPathFrom(sourcePath);

    let sourcePathStat = fs.statSync(sourcePath);
    stat.total++;
    if (sourcePathStat.isDirectory()) {
      ensureDir(targetPath);
      stat.directories++;
    } else {
      if (isSrcNotChanged(sourcePath)) {
        stat.skipped ++;
        if (!options.quite) {
          log('skip');
        }
        return;
      }

      ensureDir(path.dirname(targetPath));
      if (sourcePath.endsWith('.html')) {
        if (processHtml(sourcePath, targetPath)) {
          log('render');
        } else {
          log('copy');
        }
      } else {
        stat.copied++;
        if (!options.quite) {
          log('copy');
        }
        fs.copyFileSync(sourcePath, targetPath);
      }
    }

    function log(action) {
      if (options.quieter) return;

      switch (action) {
      case 'render':
        console.log(chalk.red.bold('RENDER:'), sourcePath);
        break;
      case 'copy':
        if (options.quiet) return;
        console.log(chalk.yellow.bold('COPY:'), sourcePath);
        break;
      default:
        if (options.quiet) return;
        console.log(chalk.green.bold('SKIP:'), sourcePath);
        break;
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
      return true; // rendered
    } else {
      fs.copyFileSync(sourcePath, targetPath);
      stat.copied++;
      return false; // no math, copied
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
    return sourcePath.replace(src, target);
  }

  function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
