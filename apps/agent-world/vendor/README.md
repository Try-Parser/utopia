# Local graphics dependency

Three.js 0.186.1, MIT license (three.LICENSE). The checked-in bundle exposes only exports listed in three.entry.js. No CDN or build tool is needed to run Agent World.

Rebuild in a disposable Docker directory with these files mounted or copied:

```sh
npm ci --no-audit --no-fund
./node_modules/.bin/esbuild three.entry.js --bundle --minify --format=iife --global-name=OfficeThree --outfile=three.min.js
```

The lockfile pins Three.js and esbuild, including package integrity. The bundle SHA-256 is `7dd57446ecf882650776e15d0ef2ab42aae86e01143bf8fe32ac828138342bc4`.

The v8 entry adds the render-target, depth-texture, shader-material, orthographic-camera, vector/color and texture-format exports required by `office-art.js`. It uses one bounded half-float linear HDR target and one depth texture for real scene-depth shading, then tone maps and converts output color once in the fullscreen composite. Unsupported HDR capabilities retain the direct scene renderer. The pinned dependency versions and lockfile are unchanged.

The v9 entry additionally exposes the pinned package's `PointLight` for eight bounded, unshadowed warm interior lights in the reference model kit. Dependency versions and package integrity remain unchanged. The checked-in bundle was rebuilt with the pinned lockfile in Docker.
