# paramodules

**Stateless, parametrizable runtime modules — type-inferred primitives for cascading full-stack application architecture.**

`paramodules` lets you model application behavior as small runtime modules. A paramodule is a typed factory that carries the dependency graph it needs to run. You provide params at the entry-point, request a module, and get back one immutable, request-scoped snapshot of the whole graph.

The main use case is cascade management. In a full-stack app, one request input often determines many downstream decisions: what data to load, what shape to return, what actions the UI can show, and which derived values must refresh after a write. Paramodules gives that chain a first-class primitive.

```ts
import { service, index } from "paramodules"

const $session = service("session").param<{ userId: string }>()

const $profile = service("profile").module({
    required: [$session],
    factory: ({ session }) => ({ name: session.userId })
})

const $greeting = service("greeting").module({
    required: [$profile],
    factory: ({ profile }) => `Hello, ${profile.name}!`
})

const message = $greeting.request(index($session.of({ userId: "ada" }))).get()
// "Hello, ada!"
```

Declare params, compose modules, request a module with concrete inputs. That's it

Only params need to be provided at the request entry-point, and Typescript will tell you exactly what you need to provide. All transitive modules are auto-wired. In the chain above, only $session needs to be provided to .request().

---

### Functions and classes are the wrong unit of decoupling

We usually start decoupling code by extracting functions or classes. A function has inputs and an output. A class has methods and private state. Both can be tidy local units.

But real applications are dominated by **cascades**: a value or change in one place ripples through many others.

A logged-in user flows into a data loader, into an API response, into a page, into the actions that page is allowed to show. A form submission updates a record, refreshes the page data, and changes the derived UI that used the old value. A state update re-renders every dependent UI node. A feature flag can change which branch of the page loads and which actions are available. The pieces may be separated into clean functions or classes, but the cascade still couples them.

This is why apps that decouple code using functions or classes need external plumbing to wire the cascade back in:

- Dependency injection containers that wire functions and classes back together at runtime.
- UI frameworks that add schedulers, loaders, suspense boundaries, context propagation, and caching to control render cascades.
- Global stores and context systems that move values through layers that do not otherwise need to know about them.
- Caching frameworks that force you to manually invalidate after every mutation, because they don't know about how derived values flow through the cache.
- Manual function argument typing in Typescript because functions are isolated and cannot infer the types of the arguments they receive.

The problem is not that functions and classes are bad. They are just the wrong primitive for this job. A function can compute a value, but it does not carry the cascade it belongs to. A class can hide state, but it still needs something else to decide how its dependencies are wired for the current request.

So the cascade ends up living somewhere else. Sometimes that place is a container. Sometimes it is a framework runtime or a global store. Sometimes it is just manual wiring spread across the call stack.

### Modules are the right unit of decoupling

A paramodule is a function-like unit that carries its dependency graph.

```ts
const $profile = service("profile").module({
    required: [$session, $db],
    factory: ({ session, db }) => db.profiles.findById(session.userId)
})
```

`$profile` is not just a factory. It is the factory plus the typed list of everything it needs. If another module depends on `$profile`, it inherits that dependency stack transitively. If you pass `$profile` to a test, a server route, a script, or another module, its cascade comes with it.

---

## Why paramodules? 🤔

- **Modules, not functions or classes, as the unit of decoupling** — a module carries the dependency graph it needs, so the cascade is part of the primitive instead of something a container rebuilds later.
- **Type inference cascades end to end** — TypeScript follows params and modules through the graph. Change an upstream shape and downstream factories update immediately.
- **Stateless and request-scoped** — each `.request(...)` creates its own immutable graph snapshot, so values do not leak through a global registry or singleton container.
- **Parametrizable at the entry point** — Your entire app shape-shifts declaratively depending on the params and modules provided at the request entry-point. Include request params, but also feature flags, environments, and swap entire module implementations with .mock() and .hire().
- **Memoized by construction** — shared dependencies resolve once per request, in parallel by default. Diamond dependencies do not recompute.
- **Nested request scopes** — use `ctx(...)` when a factory needs to request another module with different params while keeping that nested resolution scoped and typed.
- **Framework-agnostic core** — Can augment any framework, works anywhere Typescript runs.

---

## Install

```bash
npm install paramodules
```

```ts
import { service, index, once, sleep } from "paramodules"
```

## Cascade Examples

The same module primitive shows up in a few common full-stack flows.

### Type-Inference Cascades

Types flow through the graph from params to modules to downstream modules.

```ts
const $currentUser = service("currentUser").param<{
    id: string
    name: string
    avatarUrl: string | null
}>()

const $profile = service("profile").module({
    required: [$currentUser],
    factory: ({ currentUser }) => ({
        id: currentUser.id,
        label: currentUser.name,
        avatar: currentUser.avatarUrl ?? "/default-avatar.png"
    })
})

const $profileSummary = service("profileSummary").module({
    required: [$profile],
    factory: ({ profile }) => `${profile.label} (${profile.id})`
})
```

Rename `currentUser.avatarUrl`, and the `$profile` factory fails at compile time. Rename `profile.label`, and `$profileSummary` fails too. The types follow the graph from param to module to module.

### Prop-Drilling Cascades

A deep module declares the params it needs directly. Intermediate modules do not have to accept and forward values just to keep the chain alive.

```ts
const $auditLog = service("auditLog").module({
    required: [$session, $db],
    factory:
        ({ session, db }) =>
        (action: string) =>
            db.audit.insert({ userId: session.userId, action })
})

const $report = service("report").module({
    required: [$auditLog],
    factory:
        ({ auditLog }) =>
        () =>
            auditLog("generated-report")
})
```

`$report` does not mention `$session`, even though `$auditLog` needs it. The module graph carries that dependency stack.

### Data Loading Cascades

Factories can be `async`, and you write them plainly with `async` and `await`. The thing to know is that a chain of async modules does not turn into a loading waterfall. When you request a module, paramodules starts resolving every module it needs in the background, so independent loads run in parallel instead of one-after-another.

```ts
const $profile = service("profile").module({
    required: [$session, $db],
    factory: async ({ session, db }) =>
        await db.profiles.findByUserId(session.userId),
    awaited: true // This makes the type of this module Profile instead of Promise<Profile>
})

const $notifications = service("notifications").module({
    required: [$session, $db],
    factory: async ({ session, db }) =>
        await db.notifications.findForUser(session.userId),
    awaited: true // This makes the type of this module Notification instead of Promise<Notification>
})

const $dashboard = service("dashboard").module({
    required: [$profile, $notifications],
    factory: ({ profile, notifications }) => {
        return {
            profile,
            notifications
        }
    }
})

const dashboard = await $dashboard.request(index($session.of(session))).get()
```

`$profile` and `$notifications` both need `$session` and `$db`, but they do not need each other. Requesting `$dashboard` kicks off $dashboard, $notifications and $profile factories all in parallel and in the background.

Make the loading **lazy** by returning functions from factories.

```ts
const $profile = service("profile").module({
    required: [$session, $db],
    factory: ({ session, db }) =>
        once(async () => await db.profiles.findByUserId(session.userId))
})

const $notifications = service("notifications").module({
    required: [$session, $db],
    factory: ({ session, db }) =>
        once(async () => await db.notifications.findForUser(session.userId))
})

const $dashboard = service("dashboard").module({
    required: [$profile, $notifications],
    factory: async ({ profile, notifications }) => ({
        profile: await profile(),
        notifications: await notifications()
    })
})

const dashboard = await $dashboard.request(index($session.of(session))).get()
```

This intentionally creates a waterfall. First `$dashboard` starts. Only inside its factory does `profile()` and `notifications()` start loading. That gives the dashboard factory control over when loading begins, so if some loading is expensive but conditional, the lazy pattern can be useful.

If for optimization and testing, you need to easily toggle between lazy or eager behavior, you can use the warmed-up factory pattern:

```ts
const $profile = service("profile").module({
    required: [$session, $db],
    factory: ({ session, db }) =>
        once(async () => await db.profiles.findByUserId(session.userId)),
    warmup: (profile) => {
        profile()
    }
})

const $notifications = service("notifications").module({
    required: [$session, $db],
    factory: ({ session, db }) =>
        once(async () => await db.notifications.findForUser(session.userId)),
    warmup: (notifications) => {
        notifications()
    }
})

const $dashboard = service("dashboard").module({
    required: [$profile, $notifications],
    factory: async ({ warmLoadProfile, warmLoadNotifications }) => ({
        profile: await profile(),
        notifications: await notifications()
    })
})
```

Now profile and notifications are still loaded eagerly, but you can toggle easily just by removing or commenting out their warmup function. You don't need to refactor all dependent call sites from **value** to **await value()** when you toggle, they stay as **await value()**

### Cache Invalidation Cascades

In most frameworks, cache invalidation must be done manually. Paramodules understand cache dependencies, so invalidating one module cascades and invalidates all dependents. The trick is to use the whole dependency graph to build the module's cache key.

```ts
import { create as createValueCacher } from "@paramodules/value-cacher"

const cache = new Map<string, unknown>()
const serializer = (value: unknown) => JSON.stringify(value)
const valueCaching = {
    cacher: createValueCacher(cache),
    serializer
}

const $cart = service("cart").param<{
    items: Array<{ productId: string; quantity: number }>
}>()

const $cartProducts = service("cartProducts")
    .module({
        required: [$cart],
        factory: ({ cart }) =>
            db.products.findManyById(cart.items.map((item) => item.productId))
    })
    .caching(valueCaching)

const $checkoutQuote = service("checkoutQuote")
    .module({
        required: [$cart, $cartProducts],
        factory: ({ cart, cartProducts }) => {
            const lines = cart.items.map((item) => {
                const product = cartProducts.find(
                    (p) => p.id === item.productId
                )

                return {
                    name: product.name,
                    quantity: item.quantity,
                    lineTotal: product.price * item.quantity
                }
            })

            return {
                lines,
                subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0)
            }
        }
    })
    .caching(valueCaching)

const cart = {
    items: [{ productId: "coffee-mug", quantity: 2 }]
}

const first = $checkoutQuote.request(index($cart.of(cart))).get()
const second = $checkoutQuote.request(index($cart.of(cart))).get()
const sameEntry = first === second // true, same cart, no invalidations

await db.products.update("coffee-mug", {
    price: 18
})
$cartProducts.invalidate()

const third = $checkoutQuote.request(index($cart.of(cart))).get()
const refreshed = second === third // false, because cartProducts has been invalidated
```

Caching is opt-in. Call `.caching(...)` after `.module(...)` when a module should reuse its value across requests. Paramodules is entirely stateless unless you activate caching. More info on caching is in `Advanced usage` below.

### Query-Building Cascades

Data loading often grows one rule at a time. Start with the records visible to the current user, narrow them to records owned by that user, then narrow again to drafts. Each step can be a module that builds on the previous step.

```ts
const $session = service("session").param<{ orgId: string; userId: string }>()

const $db = service("db").module({
    factory: () => db
})

const $visiblePosts = service("visiblePosts").module({
    required: [$session, $db],
    factory: ({ session, db }) =>
        db.select().from(posts).where(eq(posts.orgId, session.orgId))
})

const $myPosts = service("myPosts").module({
    required: [$session, $visiblePosts],
    factory: ({ session, visiblePosts }) =>
        visiblePosts.where(eq(posts.authorId, session.userId))
})

const $myDrafts = service("myDrafts").module({
    required: [$myPosts],
    factory: ({ myPosts }) => myPosts.where(eq(posts.status, "draft"))
})
```

`$myDrafts` cannot accidentally skip the visibility rule because it composes from `$myPosts`, which composes from `$visiblePosts`. The rule that decides which posts the user can see is part of the graph.

---

## Core Vocabulary

| Term                            | What it is                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `service(tm)`                   | Declare a named identity. `tm` is the runtime-validated graph key (trademark).                                                               |
| `.param<T>()`                   | A typed runtime input supplied at the request entry point.                                                                                   |
| `.init(value)`                  | Give a param a default value so it can be omitted from `request(...)`.                                                                       |
| `.module({ ... })`              | A graph node: a value derived from params and other modules. Chain after `.param()` to fill that param.                                      |
| `required`                      | Dependencies that must be available to the factory.                                                                                          |
| `optionals`                     | Params a module can use if supplied; factories see them as `T \| undefined`.                                                                 |
| `factory`                       | The function that produces the module value from inferred supplies and `ctx`.                                                                |
| `warmup`                        | Optional hook invoked after the factory returns, useful for eager warming of lazy values.                                                    |
| `.caching(config)`              | Enable cross-request caching after `.module(...)`.                                                                                           |
| `.of(value)`                    | Stamp a concrete value onto a param or module, producing a supplier (enters the cache key).                                                  |
| `.request(...)`                 | Resolve a module for one set of supplied inputs.                                                                                             |
| `.provision()`                  | Pre-resolve graph parts that do not depend on open request-time params.                                                                      |
| `.invalidate()`                 | Bump a cached module's version so it and downstream cached modules recompute.                                                                |
| `.mock()` + `.hire()`           | Replace part of a cascade without changing downstream call sites.                                                                            |
| `.param().module()` + `.hire()` | Fill a shared param at the entry-point with a same-trademark module. Remaining open params still show up as missing `.request()` properties. |
| `ctx(...)`                      | Create a nested request scope from inside a factory.                                                                                         |
| `index(...)`                    | Key suppliers by trademark for the object shape `.request(...)` expects.                                                                     |
| `supplier.get()`                | Read the requested module's value.                                                                                                           |
| `supplier.supplies`             | Read resolved values for the graph, keyed by trademark.                                                                                      |
| `supplier.market`               | Read suppliers for the graph, keyed by trademark.                                                                                            |

---

## Getting Started

### 1. Declare Params

Params are request-time inputs. They have no factory.

```ts
const $session = service("session").param<{ userId: string }>()
```

### 2. Compose Modules

Modules derive values from params and other modules.

```ts
const $db = service("db").module({
    factory: () => database
})

const $profile = service("profile").module({
    required: [$session, $db],
    factory: ({ session, db }) => db.profiles.findById(session.userId)
})

const $profileSummary = service("profileSummary").module({
    required: [$profile],
    factory: ({ profile }) => ({
        name: profile.name,
        joinedYear: profile.createdAt.getFullYear()
    })
})
```

The factory receives `supplies`, an object keyed by the trademarks in `required` and `optionals`. Everything is inferred from the dependency list.

### 3. Request at the Entry Point

```ts
const profileSummary = $profileSummary
    .request(index($session.of({ userId: "ada" })))
    .get()
```

`index(...)` builds the request object from suppliers. Missing required params are type errors. Optional and initialized params can be omitted.

---

## Reading Values Back Out

`.request(...)` returns a supplier.

```ts
const supplier = $profileSummary.request(index($session.of({ userId: "ada" })))

supplier.get()
supplier.supplies.session
supplier.supplies.profile
supplier.market.profile.get()
```

`supplier.get()` reads the requested module's value. `supplier.supplies` exposes unwrapped values for the cascade. `supplier.market` exposes suppliers, which lets you read lazily and preserve supplier identity.

---

## Advanced usage

### Optionals

Put a param in `optionals` when a module can use it if present but should still resolve without it.

```ts
const $config = service("config").param<{ apiUrl: string }>()
const $auth = service("auth").param<{ token: string }>()

const $client = service("client").module({
    required: [$config],
    optionals: [$auth],
    factory: ({ config, auth }) => ({
        apiUrl: config.apiUrl,
        token: auth?.token ?? null
    })
})

const anonymous = $client.request(index($config.of(config))).get()
const signedIn = $client
    /*$auth.of(auth) can be omitted here without Typescript complaining, as it is optional in the graph*/
    .request(index($config.of(config), $auth.of(auth)))
    .get()
```

Inside the factory, `auth` is inferred as `{ token: string } | undefined`.

### Nested Request Scopes with ctx(...)

Sometimes a factory needs to run another module with different request params. `ctx(...)` creates that nested request scope. A common case is impersonation: a procedure that starts as one user, then needs to run part of the workflow as another user.

```ts
const $session = service("session").param<{
    userId: string
}>()

const $receiveMoney = service("receiveMoney").module({
    required: [$session, $db],
    factory:
        ({ session, db }) =>
        async (amount: number) => {
            const account = await db.accounts.findByUserId(session.userId)

            if (account.userId !== session.userId) {
                throw new Error(
                    "Cannot receive money into another user's account"
                )
            }

            await db.accounts.update(account.id, {
                balance: account.balance + amount
            })
        }
})

const $sendMoney = service("sendMoney").module({
    required: [$session, $db],
    factory:
        ({ session, db }, ctx) =>
        async (toUserId: string, amount: number) => {
            const senderAccount = await db.accounts.findByUserId(session.userId)

            await db.accounts.update(senderAccount.id, {
                balance: senderAccount.balance - amount
            })

            const receiveAsReceiver = ctx($receiveMoney)
                .request(
                    index(
                        $session.of({
                            userId: toUserId
                        })
                    )
                )
                .get()

            await receiveAsReceiver(amount)
        }
})

const sendMoney = $sendMoney
    .request(index($session.of({ userId: "sender_1" })))
    .get()

await sendMoney("receiver_1", 25)
```

The outer request still sees the sender session, so `$sendMoney` subtracts money from `sender_1`. The nested `ctx($receiveMoney).request(...)` call swaps `$session` to `receiver_1`, so `$receiveMoney` loads and updates the receiver's account under the receiver's permissions. `$db` is inherited from the outer request; only `$session` changes for the nested request scope.

### Initialized Params

Use `.init(value)` when a param has a default but requests should still be able to override it.

```ts
const $region = service("region").param<"us" | "eu">().init("us")

const $endpoint = service("endpoint").module({
    required: [$region],
    factory: ({ region }) =>
        region === "eu" ? "https://eu.example.com" : "https://us.example.com"
})

$endpoint.request({}).get()
// "https://us.example.com"

$endpoint.request(index($region.of("eu"))).get()
// "https://eu.example.com"
```

Initialized params remain fully typed, but they become optional in the request shape.

### Provisioning

Call `.provision()` on a module to pre-resolve compatible factories in its dependency graph at module-scope time instead of at request time. "Provision-compatible" factories are those that do not depend on request-time params transitively (or that only depend on initialized params)

```ts
const $todos = service("todos").module({
    factory: () => new Map<string, string[]>()
})

const $addTodo = service("addTodo").module({
    required: [$session, $todos],
    factory:
        ({ session, todos }) =>
        (todo: string) => {
            const current = todos.get(session.userId) ?? []
            todos.set(session.userId, [...current, todo])
            return todos.get(session.userId)
        }
})

const $app = service("app")
    .module({
        required: [$addTodo],
        factory: ({ addTodo }) => ({ addTodo })
    })
    .provision()

const app = $app.request(index($session.of({ userId: "ada" }))).get()
app.addTodo("write README")
```

`$todos` can be created once during provisioning. `$session` remains open and is provided at request-time, so $addTodo must wait request-time to run.

### Awaited modules

Pass `awaited: true` when a factory returns `Promise<T>` but the module’s `_type` should stay **`T`**. The runner awaits that module (and every `_awaited` supply in the bag) before dependents run, so other factories receive the unwrapped value — not a Promise.

```ts
const $edition = service("edition").param<{ id: string }>()

const $editionFromDb = $edition.module({
    awaited: true,
    required: [$editionId, $db],
    factory: async ({ editionId, db }) => db.editions.findById(editionId)
})

const $title = service("title").module({
    required: [$editionFromDb],
    factory: ({ edition }) => {
        // `edition` is `{ id: string }`, not `Promise<{ id: string }>`
        return edition.id
    }
})

const title = await $title.request(index($editionId.of(id))).get()
```

What that means in practice:

- **`_type` becomes `T` instead of `Promise<T>`.**
- **Dependents stay sync.** Factories that require an awaited module see `T` in their supplies.
- **`.get()` stays a Promise.** Any module whose team includes an awaited module has `.get()` typed as `Promise<Awaited<_type>>`.
- **`.supplies` becomes a Promise.**

### Caching

By default, factories are memoized inside one request snapshot. Call `.caching(...)` after `.module(...)` when a module should reuse values across separate requests and `.request(...)` calls. Remember, paramodules is entirely stateless, unless you activate caching.

```ts
import { service, index } from "paramodules"
import { create as createValueCacher } from "@paramodules/value-cacher"

const cache = new Map<string, unknown>()
const serializer = (value: unknown) => JSON.stringify(value)

const valueCaching = {
    cacher: createValueCacher(cache),
    serializer
}

const $session = service("session").param<{ userId: string }>()

const $profile = service("profile")
    .module({
        required: [$session],
        factory: ({ session }) => db.profiles.findByUserId(session.userId)
    })
    .caching(valueCaching)

const $profileSummary = service("profileSummary")
    .module({
        required: [$profile],
        factory: ({ profile }) => ({
            label: `${profile.label} (${profile.id})`
        })
    })
    .caching(valueCaching)

const res1 = $profileSummary
    .request(index($session.of({ userId: "ada" })))
    .get()
const res2 = $profileSummary
    .request(index($session.of({ userId: "ada" })))
    .get()
const isCached = res1 === res2 // true, res2 is read from the shared cache

// ---
const res3 = $profileSummary
    .request(index($session.of({ userId: "bob" })))
    .get()
const isCached2 = res2 === res3 // false, because different request param

// ---
$profileSummary.invalidate()
const res4 = $profileSummary
    .request(index($session.of({ userId: "bob" })))
    .get()
const isCached3 = res3 === res4 // false, because invalidated

// ---

$profile.invalidate()
const res5 = $profileSummary
    .request(index($session.of({ userId: "bob" })))
    .get()
const isCached4 = res4 === res5 // false, because a dependency was invalidated

// ---

const $mockProfile = $profile.mock({
    required: [],
    factory: () => ({ id: "bob", label: "Bob" })
})

const res6 = $profileSummary
    .hire($mockProfile)
    .request(index($session.of({ userId: "bob" })))
    .get()
const isCached5 = res5 === res6 // false, because the hired mock has its own _implementId
```

The cache key is built from the cached module identity and its cascade: the current module trademark, its version, implement identity when present (param-chained modules and mocks), transitive module versions, and **every stamped (`.of(...)`) value** — params and modules alike. Factory-resolved modules contribute identity only (`tm` + implement id + `_version`); their inputs are already keyed through the cascade. The serializer runs on stamped values and should reject anything it cannot handle. That means different request stamps get different cache entries, invalidating an upstream cached module changes the cache key for downstream cached modules, and two hired fills of the same param do not share an entry.

For promise-returning factories, use `@paramodules/resource-cacher`, which wraps `@epic-web/cachified`.

```ts
import { create as createResourceCacher } from "@paramodules/resource-cacher"

const $profile = service("profileResource")
    .module({
        required: [$session],
        factory: async ({ session }) =>
            await db.profiles.findByUserId(session.userId)
    })
    .caching({
        cacher: createResourceCacher({
            cache: new Map(),
            ttl: 60_000
        }),
        serializer
    })
```

#### Build your own cache config

##### Serializer

Choose a serializer that is stable for the values in your graph. `JSON.stringify` is enough for simple params, but application objects may need a serializer that sorts keys, extracts ids, or rejects unserializable values. The serializer is only used to build cache keys, if you need your values in the cache stored as strings, you need to implement that serialization in the get() and set() methods of your cache adapter.

##### Cacher

Most apps can start with the two provided cacher packages:

- `@paramodules/value-cacher` for synchronous factories and simple `Map`-like stores.
- `@paramodules/resource-cacher` for promise-returning factories, TTLs, stale handling, and other `@epic-web/cachified` features.

A cacher is just the adapter between paramodules and your storage. Paramodules gives it the factory runner and the cache key it built from the cascade. The cacher returns the memoized factory connected to your cache.

```ts
type Cacher = <T>(factoryRunner: () => T, cacheKey: string) => () => T

type ResourceCacher = <T extends Promise<unknown>>(
    factoryRunner: () => T,
    cacheKey: string
) => () => T

type Serializer = (value: unknown) => string
```

The value cacher is intentionally small:

```ts
type CacheLike = {
    get: (key: string) => unknown
    set: (key: string, value: unknown) => void
    has: (key: string) => boolean
}

function createValueCacher(store: CacheLike): Cacher {
    return (factoryRunner, cacheKey) => {
        return () => {
            if (!store.has(cacheKey)) {
                store.set(cacheKey, factoryRunner())
            }

            return store.get(cacheKey)
        }
    }
}
```

You can create your own value or resource cacher if you extra logging, metrics, or want to use another swr provider than the default @epic-web/cachified, for example. Just implement it following the type signature shown above. But most customization should be done instead at the cache level than at the cacher level.

### Stub a module with `.of(...)`

You can call `.of(...)` to provide a value for params, but also for modules. It sets the value of the module directly, without calling its factory.

```ts
const profile = $profile
    .request(
        index(
            $user.of({ id: "test", name: "Alice" }),
            $session.of({ userId: "alice-123" })
        )
    )
    .get()
```

When you stub a module, its factory is bypassed, but its declared dependencies stay in the graph, so Typescript might force you to provide required params you don't actually need. In those cases, use full alternative implementations with mocks.

### Mocking and hiring (Runtime Implementation Swaps)

`.mock(...)` creates a replacement for a module. `.hire(...)` brings that replacement into another module's graph.

```ts
const $user = service("user").module({
    required: [$session, $db],
    factory: ({ session, db }) => db.users.findById(session.userId)
})

const $profile = service("profile").module({
    required: [$user],
    factory: ({ user }) => ({ name: user.name })
})

const $userMock = $user.mock({
    required: [],
    factory: () => ({ id: "test", name: "Alice" })
})

const profile = $profile.hire($userMock).request({}).get()
// { name: "Alice" }
```

`.hire(...)` returns a new module with mocks merged into its graph. A mock may have a smaller, larger, or different dependency shape than the module it replaces. The request type updates accordingly.

---

## Factory Lifecycle

Each factory runs at most once per request snapshot. A shared dependency used by many downstream modules is computed once and then reused. Thus, factories should be pure and not perform any side-effects. If you need to run side-effects, just return a function from the factory:

```ts
const $findUser = service("findUser").module({
    required: [$db],
    factory: ({ db }) => {
        const cache = new Map<string, User>()

        return (id: string) => {
            if (cache.has(id)) return cache.get(id)
            const user = db.findUser(id)
            cache.set(id, user)
            return user
        }
    }
})
```

## How it works under the hood

When you call `$requestedModule.request({})`, paramodules builds a self-referential, lazily evaluated flat registry of all transitive dependencies of the requested module:

```ts
const registry = {
    paramSupplierA, // params are placed in directly
    paramSupplierB,

    // modules receive the registry via closure injection and use it to auto-resolve themselves lazily
    moduleSupplierA: once(() => $moduleA._resolve(registry)),
    moduleSupplierB: once(() => $moduleB._resolve(registry))
}
```

Because every node lives in the same object, TypeScript can statically follow types across the whole cascade. Because every node is memoized, each factory runs exactly once per request. Because the object is local, there's no global state — every `request()` is its own little universe.

That's the whole trick. There is no container — the graph _is_ the value.

---

---

## API Reference

### `service(tm)`

```ts
const $session = service("session")
```

The entry point. `tm` must be a valid JavaScript identifier: letters, digits, `_`, or `$`, with no leading digit, as it'll be transformed as a plain JS variable. The `$` prefix on variables is only a convention to easily distinguish services from values.

### `.param<T>()`

```ts
const $session = service("session").param<{ userId: string }>()
```

Creates a typed runtime input. Provide it to a request with `.of(value)`. Chain `.module({ ... })` on the param when another package should supply a factory for the same trademark.

### `.init(value)`

```ts
const $region = service("region").param<"us" | "eu">().init("us")
```

Sets a default value for a param. Modules that require an initialized param can be requested without supplying it, while callers may still override it with `.of(...)`.

### `.module({ required?, optionals?, factory, warmup? })`

```ts
const $user = service("user")
    .module({
        required: [$session, $db],
        optionals: [$logger],
        factory: ({ session, db, logger }) => db.users.findById(session.userId),
        warmup: (userPromise) => {
            void userPromise
        }
    })
    .caching({
        cacher,
        serializer: (value) => JSON.stringify(value)
    })
```

Creates a module. `required` values are inferred as present. `optionals` are inferred as `T | undefined`. The factory receives `(supplies, ctx)`. `.caching(...)` optionally wraps the factory in a cross-request cacher and uses `serializer` to include supplied values in the cache key.

### `.caching(config)`

```ts
const $user = service("user")
    .module({
        factory: ({ session, db }) => db.users.findById(session.userId)
    })
    .caching({
        cacher,
        serializer: (value) => JSON.stringify(value)
    })
```

Enables cross-request caching after `.module(...)`.

### `.of(value)`

```ts
const supplier = $session.of({ userId: "ada" })
```

Creates a supplier for a concrete param or module value (`_requested: true`). For modules, this bypasses the factory but does not remove the module's declared dependency shape. Stamped values are serialized into cache keys; factory-resolved modules are not.

### `.request(suppliers)`

```ts
const supplier = $app.request(index($session.of({ userId: "ada" })))
```

Resolves a module for one input set and returns a supplier. `.request(...)` takes a plain object keyed by trademark; `index(...)` is just the type-safe helper for building that object from suppliers.

### `.provision()`

```ts
const $app = service("app")
    .module({
        required: [$router],
        factory: ({ router }) => ({ router })
    })
    .provision()
```

Pre-resolves graph parts that do not depend on open params. Call it on roots you will later request.

### `.invalidate()`

```ts
$user.invalidate()
```

Bumps a cached module's internal version. Future requests for that module, and for cached modules that depend on it transitively, use a new cache key and recompute. Only modules configured with `.caching(...)` can be invalidated.

### `.mock(plan)`

```ts
const $userMock = $user.mock({
    required: [],
    factory: () => ({ id: "test", name: "Alice" })
})
```

Creates a replacement module with the same trademark and a compatible value type.

### `.hire(...mocks)`

```ts
const profile = $profile.hire($userMock).request({}).get()
```

Returns a new module with mocks merged into its dependency tree. Hired modules override matching trademarks. If the graph `required`s a param, `hire()` type-errors until a same-trademark module is included (or the param is stamped with `.of(...)`).

### `ctx(service)`

```ts
const value = ctx($otherModule)
    .request(index($param.of(next)))
    .get()
```

Creates a nested request scope from inside a factory so another module can be requested with different params without mutating the outer request.

### `supplier.get()`

```ts
const value = supplier.get()
// Awaited team — one Promise of the unwrapped `_type`
const value = await supplier.get()
```

Reads the supplier's value. On an awaited team (the module or a teammate has `awaited: true` / `_awaited`), `get()` returns `Promise<Awaited<_type>>` — never a nested `Promise<Promise<…>>`.

### `supplier.supplies`

```ts
// Sync team
supplier.supplies.session

// Awaited team — same bag the factory receives after awaiting `_awaited` deps
const { session, profile } = await supplier.supplies
```

Resolved values for the graph, keyed by trademark. On awaited teams this is a real `Promise` of the unwrapped bag (shared with the factory runner).

### `supplier.market`

```ts
supplier.market.profile.get()
```

Suppliers for the graph, keyed by trademark.

### `index(...suppliers)`

```ts
$app.request(index($session.of({ userId: "ada" })))
```

Builds the keyed request object expected by `.request(...)`. You can write that object by hand, but `index(...)` keeps the supplier keys and types aligned with their trademarks.

## Contributing

Issues and PRs welcome.

## License

MIT
