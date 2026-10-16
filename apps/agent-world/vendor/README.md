# Local graphics dependency

Three.js 0.186.1, MIT license (three.LICENSE). The checked-in bundle exposes only exports listed in three.entry.js. No CDN or build tool is needed to run Agent World.

Rebuild in a disposable Docker directory with these files mounted or copied:

```sh
npm ci --no-audit --no-fund
./node_modules/.bin/esbuild three.entry.js --bundle --minify --format=iife --global-name=OfficeThree --outfile=three.min.js
```

The lockfile pins Three.js and esbuild, including package integrity. The bundle SHA-256 is `0725a4891991894d2f3e2e1a609d24f3ada4636f332ed7c74741aaaa36d75701`.
