# One form per trademark on a graph; hire overwrites

A trademark is a param or a module on any one graph, never both. MixedForm on a plan (`required` / `optionals` plus one level of each dependency’s `_reqType`) is the type fence. `dedupe` throws if both forms still meet at runtime.

Hire is overwrite, not a second form, and it is shallow: it substitutes this module’s own required list. A param-graph module becomes an implement-graph binding with `$f.hire($rangeCursorModule)`. Parents `required` that twin, never the param-graph export. That reverses the earlier ban on hiring an implement onto a param slot (`HiredParamError`).

Deep hire and a prefer-module `Request` walk were rejected: they hide a mix and put an awaited implement under a still-sync dependent — the factory sees `Promise` as `T` and reads `undefined`. Keep-module `dedupe` was rejected for the same hole. Two `service(tm)` calls for one concept were already forbidden; the factory-bearing module is `$param.module()`.
