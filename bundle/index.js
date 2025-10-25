require("esbuild").build({
  entryPoints: ['./bundle/bundle.js'],
  bundle: true,
  format: 'esm',
  outfile: "./server/front-end/qr-admin/index.js",
  minify: true,
  platform: 'browser',
  external: [],
});