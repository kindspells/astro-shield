---
# SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
#
# SPDX-License-Identifier: MIT

title: Limitaciones conocidas
description: Limitaciones conocidas de la integración Astro-Shield.
---

## Construcción doble

⚠️ En caso de que vuestra página SSR (dinámica) incluya recursos estáticos
tales como archivos `.js` o `.css`, y que alguno de estos recursos cambie,
es posible que tengáis que ejecutar el comando `astro build` **dos veces
seguidas** (Astro-Shield emitirá un mensaje de advertencia avisando de ello en
caso que sea necesario).

Cabe la posibilidad de que resolvamos este problema en el futuro, pero es
importante destacar que hay algunos obstáculos técnicos que dificultan poder
hacerlo de forma "elegante".

## Hot-Reloading es incapaz de regenerar los hashes SRI

_Por ahora_, Astro-Shield no contiene la lógica necesaria para integrarse
con el "monitor de ficheros" que permitiría regenerar los hashes SRI cuando
algún archivo cambia.

Esto significa que si estáis ejecutando Astro en modo de desarrollo
(`astro dev`), puede ser necesario que ejecutéis manualmente el comando
`astro build` para aseguraros de que los hashes SRI están debidamente
actualizados y no rompen vuestra versión local de la aplicación web.

## Limitaciones de las especificaciones SRI y CSP

Cuando un script is se carga mediante un import _estático_ (e.g.
`import { foo } from 'https://origin.com/script.js'`) en vez de directamente
mediante una etiqueta `<script>` (por ejemplo
`<script type="module" src="https://origin.com/script.js"></script>`),
tener su hash presente en la directiva CSP `script-src` no es suficiente para
asegurar que el navegador lo aceptará (el navegador también "quiere" que proveas
información que empareje el hash con su recurso correspondiente).

Esto no es una limitación de Astro-Shield, sino una limitación resultante de
combinar las especificaciones actuales de SRCI y CSP.

Debido a esto, por ahora, es recomendable añadir `'self'` a la directiva
`script-src` (Astro-Shield lo hace por ti).
