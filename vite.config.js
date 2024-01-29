import nodeResolve from '@rollup/plugin-node-resolve'

export default {
    root: ".",
    publicDir: "static",
    plugins: [nodeResolve()],
    build: {
        target: ["chrome58","edge18","firefox57","safari11"],
        outDir: "dist",
        assetsDir: ".",
        minify: false,
        rollupOptions: {
            input: "src/index.js",
            output: {
                entryFileNames: "app.js",
                format: "umd",
                assetFileNames: "[name][extname]"
            }
        },
    }
}
