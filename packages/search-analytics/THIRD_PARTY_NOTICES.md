# Generated Chinese character folding data

`src/character-fold.gen.ts` is derived offline from `opencc-js` 1.4.2 using the `tw` to `cn` converter on individual Unicode characters. The mapping is modified into a compact TypeScript object for analytics lexical normalization; it is not the full phrase converter.

Upstream: https://github.com/nk2028/opencc-js and https://github.com/nk2028/opencc-data.
The upstream dictionary data is distributed under Apache License 2.0. A copy is included in `licenses/Apache-2.0.txt`. The runtime does not include the OpenCC converter code or full dictionaries. The project itself remains AGPL-3.0-only.
