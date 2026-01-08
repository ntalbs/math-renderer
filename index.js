#!/usr/bin/env node

import { program } from 'commander';
import { render } from './math-renderer.js';

program
  .description('MathJax renderer. Read HTML and render math formula to SVG.')
  .argument('<src_dir>', 'source directory')
  .argument('<dest_dir>', 'destination directory')
  .option('-f, --force', 'force render')
  .option('-q, --quite', 'print render message only')
  .option('--quieter', 'do not print per file message')
  .action((src_dir, dest_dir, options) => {
    render(src_dir, dest_dir, options);
  })
  .parse(process.argv);
