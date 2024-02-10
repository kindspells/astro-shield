# @kindspells/astro-sri-scp

## Introduction

This library will help you to compute the subresource integrity hashes for your
_inline_ JS scripts and CSS stylesheets.

It works by installing an Astro hook that runs once the build step is done. This
hook performs 3 steps:
1. Computes the Subresource Integrity hashes for your inline scripts and inline styles.
2. Modifies the generated HTML to include the integrity hashes.
3. In case you specified a filepath for your SRI hashes module, it will generate
   (or update) a module that exports the associated SRI hashes, so you can use
   them later for other purposes, such as configuring your
   `Content-Security-Policy` headers.

### Known limitations

- For now, the SRI hashes calculation is done only for inlined resources. This
  will be solved in future releases.
- For now, this integration only works for generated static content (the
  exported subresource integrity hashes could be used in dynamic contexts, but
  that does not cover the whole SSG use case)

## How to install

```bash
# With NPM
npm install @kindspells/astro-sri-csp

# With Yarn
yarn add @kindspells/astro-sri-csp

# With PNPM
pnpm add @kindspells/astro-sri-csp
```

## How to use

In your `astro.config.mjs` file:

```javascript
import { join } from 'node:path'

import { defineConfig } from 'astro/config'
import { sriCSP } from '@kindspells/astro-sri-csp'

const rootDir = new URL('.', import.meta.url).pathname

// In this example we set dist/client because we assume a "hybrid" output, and
// in that case it makes no sense to traverse the server-side generated code.
// If your site is 100% static, we shouldn't add the 'client' part.
const distDir = join(rootDir, 'dist', 'client')

// This is the path where we'll generate the module containing the SRI hashes
// for your scripts and styles. There's no need to pass this parameter if you
// don't need this data, but it can be useful to configure your CSP policies.
const sriHashesModule = join(rootDir, 'src', 'utils', 'sriHashes.mjs')

export default defineConfig({
  integrations: [
    sriCSP(distDir, sriHashesModule)
  ]
})
```

## License

This library is released under [MIT License](LICENSE).
