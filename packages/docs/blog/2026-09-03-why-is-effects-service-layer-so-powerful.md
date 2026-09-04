---
title: "Why is Effect's service layer so powerful?"
slug: why-is-effects-service-layer-so-powerful
authors:
    - name: Félix Dubé
      title: "@someone635"
      url: https://github.com/someone635
tags: []
draft: true
hide_table_of_contents: false
---

People come to Effect for typed errors or structured concurrency. A few months in, when they describe what they miss going back to an ordinary codebase, a surprising number of them name the service layer instead.

That bothered me, because on paper the service layer is the least novel thing in the library. Dependency injection is old. Spring shipped in 2002. Whatever is going on here, "it does DI" cannot be the explanation.

So I went looking for the real one, and it turned out to be a property that has almost nothing to do with injection.

{/_ truncate _/}

## Two answers that aren't it

**"It's dependency injection."** Martin Fowler named the pattern in 2004. If injecting dependencies were the source of the power, we would have been enjoying it for twenty years. Nobody calls Spring powerful. They call it configuration.

**"It's testability."** This was DI's original pitch, and it is the one that aged worst. In JavaScript, `jest.mock` reaches into the module registry for free. It needs no architecture, no container, and no cooperation from the code being tested. Testability is the cheapest thing on the menu, so it cannot be what makes anything special.

Both answers describe what the service layer _does_. Neither explains why people miss it.

## What `R` actually is

Look at the third type parameter.

```ts
const program = Effect.gen(function* () {
    const cfg = yield* ConfigService
    const db = yield* DbService
    return db.query(cfg.url)
})
// Effect<string, never, ConfigService | DbService>
```

`ConfigService | DbService` was not written anywhere. There is no dependency list, no decorator, no registration. The mechanism is quietly elegant: **a Tag is itself an Effect whose requirement is its own identifier.** So `yield* ConfigService` is an ordinary yield of an `Effect<Value, never, ConfigService>`, and the generator unions the requirements of everything it yields. Requirements accumulate by use.

The consequence is the part that matters. Before anything runs, the type of the program states what it needs, and running it unprovided is a compile error rather than a runtime throw:

```ts
// @ts-expect-error — ConfigService | DbService is not never
Effect.runSync(program)
```

That is the answer. The power is not that dependencies get injected. It is that **the shape of the dependency graph is known before a single line executes.**

Which sounds modest until you go looking for other systems that manage it.

<sub>Effect 3 and Effect 4 differ in how you declare a service — `Context.Tag` and `Effect.Service` in v3, `Context.Service` in v4. Nothing in this essay depends on that; `yield*` accumulating into `R` is identical in both.</sub>

## JavaScript already had one, and it only holds one of each

We tend to talk about dependency injection as something imported from Java, but JavaScript has had a dependency system with a statically known graph the whole time.

```js
import { db } from "./db"
```

File paths are the tokens. `import` is `container.get()`. Bindings resolve when the module graph loads. This is a dependency injection container, and it is the reason DI never caught on in JS — the module system already did the wiring, and `jest.mock` already did the swapping, so containers arrived with nothing left to sell.

Because that graph is declared and static, tooling computes with it constantly. Tree shaking, code splitting, cycle detection, and hot module replacement all fall out of it. HMR is worth dwelling on: save a file, and the bundler walks the importer chain and invalidates exactly what depended on it. That is cascading invalidation over a declared dependency graph, and every JavaScript developer uses it daily without finding it remarkable.

The limit is scope, and it is worth stating precisely. A module binding is fixed at evaluation, and there is exactly one per specifier per realm. **You can depend on anything through an import, as long as there is only ever one of it.** A connection pool qualifies. A session does not. Neither does a shopping cart, or one row of a list.

So everything that varies falls out of the graph and travels as function arguments instead. And once it travels as an argument, nothing can be derived from it.

The workarounds admit the gap. `AsyncLocalStorage`, and Next.js's `cookies()` on top of it, deliver request-time data through a module import. But look at what the binding actually is: a function that goes and finds the value, not the value. The requirement is real and written down nowhere, which is why those APIs throw when called in the wrong place and confuse everyone who meets them.

## So for values that vary, we started guessing

If a static graph can only hold one of each thing, the obvious move for per-request values is to discover the graph at runtime instead.

Awilix did this for containers a decade ago, and did it well. `createScope()` gives you a per-request child scope, `asValue(req.session)` puts request data in it, and scoped resolution memoizes once per request. The dependencies themselves come from a proxy:

```js
asFunction(({ db, session }) => …)
```

Destructure the cradle, and the proxy resolves each key on property access.

Signals work the same way at the other end of the stack. Read a signal inside a reactive computation and the getter registers that read against the computation currently running. Solid, Vue, MobX, Angular, and a TC39 proposal all share the mechanism.

Give discovery its due: **it cannot drift.** The read _is_ the registration, so it can never be wrong about what you used. That is strictly better than a dependency array, which is a separate description of what the body reads, related to the body by nothing the language enforces. `exhaustive-deps` exists because that description goes stale, and when the lint rule proved insufficient React shipped a compiler to infer the arrays humans kept getting wrong.

The problem with discovery is not correctness. It is timing.

The graph exists only while the code runs, and by then most of the useful decisions are already behind you. You cannot start two independent loads concurrently, because you learn that a computation needs the database at the instant it reads the database, and by then you are inside it and serialized. You cannot compute a cache key for a value you have never computed. You cannot type any of it: Awilix's cradle is a hand-written global interface that every factory sees in full, so nothing checks that a factory declared what it uses, and a missing registration surfaces as a runtime `AwilixResolutionError`.

The famous footguns come from the same root. Destructuring props loses reactivity in Solid and Vue. Tracking is lost across an `await`. A branch that does not execute registers nothing, so a later change to it propagates nowhere. The graph is real, and it is only real while running.

## The combination almost nobody has

Two axes fall out of this. When do the values exist, and is the graph known before execution?

|                    | graph known before running | graph discovered while running                        |
| ------------------ | -------------------------- | ----------------------------------------------------- |
| **startup values** | ES modules                 | Spring, Guice, Nest by default, Awilix's root scope   |
| **request values** | **Effect**                 | Awilix scopes, signals, query keys, dependency arrays |

Look at how consistently everything correlates. If your values vary per request, your graph gets discovered at runtime. If your graph is static, your values exist once. The correlation is so uniform across so many independent designs that it reads like a constraint of the universe.

It isn't. Effect's `R` is a compile-time union describing values that will not exist until a request arrives. The shape is fixed statically; the contents vary per call. Nothing required those two to be linked, and Effect is one of the very few places where they aren't.

And there is a neat piece of evidence inside the library that the _knowledge_ is the payoff rather than the injection. Effect uses the layer graph to schedule construction: two independent layers that each take 500ms to build, composed with `Layer.merge`, finish in a little over 500ms rather than a full second. It can do that because it knows the shape before it starts building.

Your business logic, meanwhile, stays sequential unless you ask for concurrency explicitly. Not because layer construction is somehow better understood than business logic, but because a `Layer` is a value with edges you can walk at runtime, and an Effect's requirements are a type you cannot. `yield* ConfigService` compiles down to a lookup by key on the fiber's ambient context — mechanically the same move as the proxy cradle. The static graph and the running program are two separate channels, and only one of them ever sees the shape.

That asymmetry is the whole argument in one library. **The part that exists as data, Effect optimizes. The part that exists only in the types, you manage by hand.**

## What that means

The graph has to be knowable before execution, and there are exactly two ways to get there. The type system can accumulate it, which is Effect's route. Or you can write it down. What does not work is discovering it while running, because everything worth doing with a dependency graph — scheduling work, deciding whether a cached value is still good, telling a developer what is missing, answering "what does this page load?" — has to happen before the code that would reveal the answer.

The belief standing in the way is that writing dependencies down is boilerplate. It is worth noticing where we already reject that. Bazel makes you declare `deps = [...]` on every target and nobody calls it ceremony, because it buys hermetic caching, remote execution, and knowing which tests a change affects. `package.json` is the same bargain, and it bought lockfiles, deduplication, and audit.

One limit is worth naming, because it is the boundary of what Effect's approach can reach. The knowledge is entirely compile-time. `R` is a phantom type with no runtime existence — inspect an unrun Effect and its own properties are an opcode, a few instruction slots, a trace, a commit, and a symbol. There is no API that enumerates a program's requirements before it runs, and in principle there could not be an exact one, since a requirement inside a branch that never executes still appears in the type.

So the compiler can check the graph, but nothing can walk it. That is why per-request deduplication and batching in Effect are separate machinery — `Request` and `RequestResolver`, with caching and batching each opt-in — rather than something that falls out of the graph you already declared.

## A disclosure, and a smaller version

I should say at this point that I did not arrive at any of this neutrally. I maintain a library in this space, which is how I ended up caring what makes Effect's service layer work.

I wanted this one property — request-time values with a graph known ahead of time — without adopting an effect system to get it. Effect is a language for your whole program, and its DI is one part of it; a plain async function can sit at the leaves or at the edges, but it cannot consume `R`. So [paramodules](/) takes the other route to the same place. Dependencies are declared rather than accumulated:

```ts
const $checkoutQuote = service("checkoutQuote").module({
    required: [$cart, $cartProducts],
    factory: ({ cart, cartProducts }) => …
})
```

`required` is an array of module references, so the graph exists as ordinary data as well as in the types — the property that makes a `Layer` walkable, applied to per-request values instead of to services. That is the part that pays: because the closure can be walked before the factory runs, a cache key can be composed from it, and invalidating one module invalidates everything derived from it without anyone declaring the relationship.

The price is everything an effect system buys. No typed errors, no interruption, no fibers. If you want those, use Effect — it is very good, and this essay is the long version of why.
