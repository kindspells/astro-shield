/// <reference path="./.sst/platform/config.d.ts" />

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
        hostedZone: 'kindspells.dev',
        domainName: 'astro-shield.kindspells.dev'
      }
    });
  },
});
