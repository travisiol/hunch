// `node --test --import ./tests/register.mjs`: strip TypeScript types and map the `@/` alias.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL("./tests/loader.mjs"), pathToFileURL("./"));
