/// <reference path="./.sst/platform/config.d.ts" />

/*
 * SPDX-FileCopyrightText: 2024 KindSpells Labs S.L.
 *
 * SPDX-License-Identifier: MIT
 */

export default $config({
  app(input) {
    return {
      name: "docs",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Astro("AstroShield", {
      domain: {
        dns: sst.aws.dns(),
        name: 'astro-shield.kindspells.dev'
      }
    });
  },
});
