---
status: superseded by ADR-0003
---

# Maybe stamps: `.of()` may miss; the runner throws only on a maybe miss

Maybe is one fact: the factory or the stamp may yield `_type | undefined` while `_type` stays `T`. A maybe param is `.maybe()` on that slot; a maybe module is `maybe: true` on the plan. `.of()` on any `_maybe: true` service accepts `T | undefined`. That stamp is not unspecify — omit still applies `.init()`. The runner throws on a required read only for an empty slot or a maybe service whose value is `undefined`. A definite service whose `_type` includes `undefined` may yield that value on a required read. This supersedes ADR 0001’s “keep `.of()` definite” clause.

**Considered options**
- Second trademark / maybe-param as a different concept — rejected: one name, one type.
- Make maybe-param request keys optional — rejected: the caller passes the maybe value; omit stays unspecify.
- Infer `maybe: true` on `.module()` from a maybe param — rejected: mark each boundary that can miss.
- Treat every `undefined` as a miss — rejected: slot-typed `undefined` is a value.
- No-op `.maybe()` when `_type` already includes `undefined` — rejected: runtime would still set `_maybe` and throw. The chain is a type error.
