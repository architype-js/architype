# One form per trademark in a graph

A trademark is a param or a module in any one graph, never both. `dedupe` throws when it meets both forms for a trademark, so a mixed graph fails when the module is declared (or hired), not on a request.

Dedupe used to give the slot to the module and drop the param. That silently broke awaited implements: a dependent that declared the *param* computes `_awaited` from its declared dependencies, and params are never awaited, so it kept the sync factory runner and its factory received the implement's un-awaited `Promise`. The dereference produced `undefined` — no throw, no type error, since `awaited: true` exists precisely to keep `_type` as `T` for dependents. A dependent's runner cannot know at declaration time whether the trademark will be filled by a stamp, a sync implement, or an async one.

So a param is filled by a stamped value and nothing else, and `hire` only ever replaces or adds a module. Hiring onto a trademark the graph holds as a param throws, even the param's own implement on the module that declares it: substituting it there is sound, but allowing it keeps two forms per trademark in the model and makes the legal shape depend on how far up the hire sits.

`$param.module()` then means a module that borrows a param's trademark and type. Dependents `required` (or `optionals`) the module to consume it. Its value crosses into a graph built on the param as a stamp:

```ts
const edition = await $editionFromDb.request(index($editionId.of(id))).get()
$page.request(index($edition.of(edition)))
```

A stamp holds a value rather than a factory, so it fits a sync dependent and an awaited one alike. Params and their implements are two graph structures joined by trademark stamps.

Both halves are checked at the type level, alongside the duplicate-trademark and circular checks:

- `ModulePlanGuard` rejects a plan whose services mix forms, as `MixedFormError<TM>`. A service's form comes from the plan's own tuple plus one level of each dependency's `_reqType`. One level is enough because a dependency's own guard already rejected a mix inside its subtree.
- `HiredGuard` rejects hiring a param trademark, as `HiredParamError<TM>`. Module trademarks are request keys too — a required module is stubbable with `.of()` — so the slot's `service` is what tells a param key from a module key.

**Considered options**

- Throw only when the module filling a param slot is `awaited: true` — rejected: sound (only `awaited` corrupts; a `maybe` miss already throws `Dependency <tm> is not available` at the reading factory), and it broke nothing in the suite, but it leaves two forms per trademark in the model and lets adding `awaited: true` to a module break a distant graph that consumes it as a param.
- Keep hiring an implement onto the module that declares the param — rejected: see above. Cost was 24 tests, restructured so the consumer declares the implement or the entry point stamps a value.
- Compute the awaited gate from the registry at resolve time — rejected: the dependent then returns a `Promise` while its `_awaited` is `false` and its `_type` is `T`, so its own dependents skip the per-entry await and receive the promise. It moves the corruption up one level; propagating "turned out to be awaited" upward at request time cannot be reflected in types fixed at declaration.
- Treat params as possibly-awaited in `RequiredHaveAwaited` — rejected: any param can be implemented asynchronously later, so nearly every `.get()` becomes a `Promise` and the `awaited: true` / `_type` split loses its purpose.
