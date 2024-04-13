---
# SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
#
# SPDX-License-Identifier: MIT

title: Known Limitations
description: Known limitations of the Astro-Shield integration.
---

## Double Build

⚠️ In case your SSR (dynamic) pages refer to static `.js` or `.css` files, and
any of these resources change, then you might have to run the `astro build`
command **two consecutive times** (Astro-Shield will emit a warning message
telling you about it in case it is needed).

We might try to improve this in the future, but there are some technical issues
that make it hard to solve this problem in an elegant way.

## Missing File Watcher

_For now_, Astro-Shield does not provide file watcher logic that would
automatically regenerate the SRI hashes when files change.

This means that if you are running Astro in development mode (`astro dev`), you
might have to manually run `astro build` to avoid having stale SRI hashes that
break your local version of the site.

## SRI & CSP spec limitations

When a script is loaded with a _static_ import (e.g.
`import { foo } from 'https://origin.com/script.js'`) rather than directly
included with a `<script>` tag (e.g.
`<script type="module" src="https://origin.com/script.js"></script>`), having
its hash present in the `script-src` CSP directive is not enough to ensure that
the browser will accept it (the browser also wants you to provide information
that pairs the hash with a specific resource).

This, in itself, is not a limitation of Astro-Shield, but rather a limitation of
the combination of current SRI and CSP specs.

Because of that, for now, it is advisable to add `'self'` to the `script-src`
directive (Astro-Shield does it for you).
