---
status: superseded by ADR-0002
---

# `maybe: true` keeps `_type` as `T`; the runner guards required reads

A param is one concept. Absence is not a second trademark (`$authUser` / `$maybeAuthUser`), and it is not put into the slot type. Pass `maybe: true` so a factory may return `T | undefined` while `_type` stays `T` — the same move as `awaited: true` for `Promise<T>`.

`.of()` is unchanged: it stamps a definite `T`. Omit the slot (or pass `undefined` to `index`) when there is no value.

The runner throws `Dependency <tm> is not available` only when the factory **reading** that trademark listed it under `required` and the value is `undefined`. After hire, a trademark can sit in both `_required` (the hired module) and `_optionals` (the original param); treat that as optional. `optionals` consumers see `T | undefined` and do not throw. A `maybe: true` module may itself be listed in `optionals` (same as a param): it auto-wires, the factory sees `T | undefined`, and a miss does not throw. Definite modules stay in `required`.

**Considered options**
- Two params (definite vs maybe) — rejected: same move as a separate promise param; `awaited` already refused that.
- Put `undefined` in the slot type — rejected: every required factory would see `T | undefined`.
- Widen `.of()` to `T | undefined` / unspecify via `.of(undefined)` — rejected: omit the slot; keep `.of()` for definite stamps. **Superseded by ADR 0002.**
- Throw whenever a maybe module’s factory returns `undefined` — rejected: optional consumers must still see the miss.

**Consequences**
Domain `param<T | null>()` stays a slot-type fact, distinct from `maybe: true`. Hire of a maybe implement closes the required key; a miss is a runtime throw only for required-not-optional readers, not a type error on `.request({})`.
