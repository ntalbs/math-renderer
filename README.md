# render-math

Render MathJax formula inside html fiies from `--src-dir` to SVG and
write the result html files to `--dest-dir`.

```console
render-math --help
Usage: render-math [options]

MathJax renderer. Read HTML and render math formula to SVG.

Options:
  --src-dir <path>   source directory (default: "...")
  --dest-dir <path>  destination directory (default: "...")
  -f, --force        force render
  -q, --quite        print render message only
  --quieter          do not print per file message
  -h, --help         display help for command
```

The program uses default source/destination directories
if you don't specify `--src-dir` and `--dest-dir` options.

```console
$BLOG_BASE_DIR/public            # src
$BLOG_BASE_DIR/rendered_public   # dest
```
