# @kindspells/astro-sri-scp

[![NPM Version](https://img.shields.io/npm/v/%40kindspells%2Fastro-sri-csp)](https://www.npmjs.com/package/@kindspells/astro-sri-csp)
![GitHub commit activity](https://img.shields.io/github/commit-activity/w/kindspells/astro-sri-csp)

## Introduction

This library will help you to compute the subresource integrity hashes for your
JS scripts and CSS stylesheets.

It works by installing an Astro hook that runs once the build step is done. This
hook performs 3 steps:
1. Computes the Subresource Integrity hashes for your scripts and styles.
2. Modifies the generated HTML to include the integrity hashes.
3. In case you specified a filepath for your SRI hashes module, it will generate
   (or update) a module that exports the associated SRI hashes, so you can use
   them later for other purposes, such as configuring your
   `Content-Security-Policy` headers.

## How to install

```bash
# With NPM
npm install --save-dev @kindspells/astro-sri-csp

# With Yarn
yarn add --dev @kindspells/astro-sri-csp

# With PNPM
pnpm add --save-dev @kindspells/astro-sri-csp
```

## How to use

In your `astro.config.mjs` file:

```javascript
import { resolve } from 'node:path'

import { defineConfig } from 'astro/config'
import { sriCSP } from '@kindspells/astro-sri-csp'

const rootDir = new URL('.', import.meta.url).pathname

export default defineConfig({
  integrations: [
    sriCSP({
      // This is the path where we'll generate the module containing the SRI
      // hashes for your scripts and styles. There's no need to pass this
      // parameter if you don't need this data, but it can be useful to
      // configure your CSP policies.
      sriHashesModule: resolve(rootDir, 'src', 'utils', 'sriHashes.mjs'),
    })
  ]
})
```

## Known limitations

- For now, this integration only works for generated static content (the
  exported subresource integrity hashes could be used in dynamic contexts, but
  that does not cover the whole SSG use case)

- The SRI hashes will be regenerated only when running `astro build`. This means
  that if you need them to be up to date when you run `astro dev`, then you will
  have to manually run `astro build`.

- It seems that when a script is loaded with a _static_ import rather than
  directly included with a `<script>` tag, having its hash present in the
  `script-src` directive is not enough to ensure that the browser will accept
  it.
  
  This means that, for now, it is advisable to add `'self'` to the `script-src`
  directive (adding `'strict-dynamic'` does not help either).

## Some guarantees for peace of mind

Astro generates files in a very deterministic way, which means that for both JS
and CSS files:
  - Their pseudo-random names are stable across different builds
  - The files' contents do not change from build to build (unless, of course, we
    change them on purpose), so their hashes are stable as well (this is nice
    for hot reloading, which does not trigger the logic of this integration).

## Other Relevant Guidelines

- [Code of Conduct](https://github.com/KindSpells/astro-sri-csp?tab=coc-ov-file)
- [Contributing Guidelines](https://github.com/KindSpells/astro-sri-csp/blob/main/CONTRIBUTING.md)
- [Security Policy](https://github.com/KindSpells/astro-sri-csp/security/policy)

## Main Contributors

This library has been created and is being maintained by
[KindSpells Labs](https://kindspells.dev/?utm_source=github&utm_medium=astro_sri_scp&utm_campaign=floss).

## License

This library is released under [MIT License](https://github.com/KindSpells/astro-sri-csp?tab=MIT-1-ov-file).
