import { cpSync } from "node:fs";

// `next build` copies public/ into the static output, but the /sw.js route
// serves the service worker from the server filesystem. .next/ is present in
// production lambdas (BUILD_ID lives there), so the template is copied next
// to it at build time — guaranteed available when the route runs.
cpSync("sw.template.js", ".next/sw-template.js");
console.log("sw.template.js -> .next/sw-template.js");
