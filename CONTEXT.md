# Paramodules

A request-scoped cascade of named slots and factories. One trademark is one concept.

## Language

**Trademark**:
The graph key for a concept. One name, one type.
_Avoid_: Service name (when meaning the key), id, token

**Param**:
An input slot with that trademark and type. Absence of a value is not a second param.
_Avoid_: Maybe-param, optional param (as a second trademark), interface

**Module**:
A factory plus the params and modules it depends on.
_Avoid_: Service (day to day), function, provider

**Cascade**:
Dependents inherit a module’s dependency stack.

**Request**:
One resolution of a module for one set of stamps and hires.

### Filling a slot

**Stamp**:
A definite value for a param or module on a request. The slot’s type, not the type plus absence.
_Avoid_: Specify, of-undefined (that is unspecify, unless `undefined` is in the slot type), stub (when meaning a real value)

**Unspecify**:
Leave a slot empty on this request. A default applies if the param has one.
_Avoid_: Stamp undefined (when it is not in the slot type), omit (as a second verb), erase (except when meaning drop a parent stamp)

**Hire**:
Put a producer on this request’s graph. Hire does not stamp a slot whose producer can miss.
_Avoid_: Implement (that is declaring the factory), inject, provide

**Implement**:
A factory that fills an existing param’s trademark. The param’s type stays the concept; the factory may miss.
_Avoid_: A second param for the promise or the miss, `.implement()`

**Awaited**:
A producer that yields a promise of the param’s type. Dependents still see the type, not the promise.
_Avoid_: Async param, promise param (as a second trademark)

**Maybe**:
`maybe: true` on a plan: the factory may return `_type | undefined`. Dependents that `required` the trademark still see `_type`; the runner throws only on that read. A miss is an empty slot or a maybe module yielding `undefined`. A definite service whose `_type` includes `undefined` may yield that value on a required read.
_Avoid_: Maybe-param, nullable slot (when the domain type is still definite), throwing because the producer missed (when the reader is optional), treating every `undefined` as a miss

### Who needs the slot

**Required**:
A dependency that must be the param’s type. The factory sees that type; the runner throws on a miss, not on a slot-typed `undefined`.
_Avoid_: Non-null, definite (as a second param)

**Optional**:
The same param or maybe module, on a factory that can run when it is unspecified. The factory sees the type or absence.
_Avoid_: A second param for the miss, putting absence into the param’s type just so two factories can disagree, a definite module in `optionals`
