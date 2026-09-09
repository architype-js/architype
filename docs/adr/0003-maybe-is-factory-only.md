# Maybe is a factory mark; `.of()` is always `T`

`.maybe()` on params and widening `.of()` to `T | undefined` added edge cases without simplifying the request site. `maybe: true` is only on a module plan: the factory may return `_type | undefined` while `_type` stays `T`. `.of()` always takes the slot type. Omit the key (or pass `undefined` to `index`) to unspecify.

The runner still throws on a required read only for a miss: no supplier, or a maybe module whose value is `undefined`. A definite param whose `_type` includes `undefined` may `.of(undefined)` on a required read — that `undefined` is a value. A maybe implement on that same param is allowed: its factory miss is a miss (required readers throw); a stamp of `undefined` on the param is not. This supersedes ADR 0002.

**Considered options**
- Maybe params / missable `.of()` — rejected: the branch at the request site remains, and slot-typed `undefined` collided with miss.
- Throw on every required `undefined` — rejected: `param<T | undefined>()` could not observe its own type.
