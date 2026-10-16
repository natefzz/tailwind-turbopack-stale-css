# tailwind-turbopack-stale-css

A minimal reproduction of a bug in `@tailwindcss/turbopack`: when you edit a CSS file during `next dev`, the dev server keeps serving the previous version of that CSS. Only restarting the dev server fixes it.

The project was generated with `create-next-app@16.4.0` (Tailwind enabled, default Turbopack bundler). `src/app/page.tsx` was reduced to a single element. The Tailwind setup is what `create-next-app` generates:

```ts
// next.config.ts
turbopack: {
  rules: {
    "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
  },
},
```

`@tailwindcss/postcss` and `postcss.config.mjs` are also included, so you can switch to the PostCSS setup by editing only `next.config.ts` (see [Compare with `@tailwindcss/postcss`](#compare-with-tailwindcsspostcss)). 

## Environment

| Package | Version |
| --- | --- |
| next | 16.4.0 (Turbopack, `next dev`) |
| tailwindcss / @tailwindcss/turbopack / @tailwindcss/postcss | 4.3.3 |
| Node.js | v25.2.1 |
| Bun | 1.3.3 |
| OS | macOS 26.4.1 |

## Reproduce

### 1. Install and start the dev server

```bash
bun install
bun run dev
```

### 2. Run the check script

In a second terminal, from the project root:

```bash
node check-stale.mjs 10
```

- The argument is the number of edits to make (default `10`).
- If the dev server is not on port 3000, set `BASE_URL`:

  ```bash
  BASE_URL=http://localhost:3001 node check-stale.mjs 10
  ```

Make sure `BASE_URL` points to **this** project's dev server. If it points to a different app, every round reports `served=null`.

### What the script does

For each round, the script:

1. Appends a unique marker to `src/app/globals.css`, such as `:root { --repro-token: "r3-1791969463058"; }`.
2. Polls the dev server for up to 8 seconds. It fetches the page HTML, follows every `/_next/static/**/*.css` link, and reads the `--repro-token` value from the served CSS.
3. Reports `ok` if the served marker matches the one it just wrote, or `STALE` if it does not.

The marker is a string rather than a color because the dev server minifies colors (`#ff0000` becomes `red`). The script checks the HTTP response directly, so browser caching and HMR do not affect the result.

When the script finishes, it restores `globals.css` to its original content. It exits with code `1` if any round was stale and `0` otherwise.

### Result

With `@tailwindcss/turbopack`, every edit after the first serves the CSS from the edit before it:

```
round 1: ok    expected=r1-1792138125759 served=r1-1792138125759
round 2: STALE expected=r2-1792138127978 served=r1-1792138125759
round 3: STALE expected=r3-1792138137037 served=r2-1792138127978
...
round 10: STALE expected=r10-1792138201103 served=r9-1792138192073

9/10 edits served stale CSS
```

This run started right after the dev server started, before any page had been requested. In round 1, the CSS is compiled for the first time, so there is no previous version to serve and the result is correct. From round 2 on, every edit is stale.

If the page has already been loaded before you run the script, round 1 is stale too and reports `served=null`: the server still returns the original CSS, which has no marker.

## Compare with `@tailwindcss/postcss`

To confirm the loader is the cause, switch to the PostCSS setup from the Next.js docs while still using Turbopack. `@tailwindcss/postcss` is already installed, and `postcss.config.mjs` already exists:

```js
// postcss.config.mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

1. In `next.config.ts`, remove or comment out the `turbopack.rules` block:

   ```ts
   // turbopack: {
   //   rules: {
   //     "*.css": {
   //       loaders: ["@tailwindcss/turbopack"],
   //       as: "*.css",
   //     },
   //   },
   // },
   ```

2. Restart the dev server and run `node check-stale.mjs 10` again.

With this setup, every round reports `ok`, and the script prints `0/10 edits served stale CSS`.
