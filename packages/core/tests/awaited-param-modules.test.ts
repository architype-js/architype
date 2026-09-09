import { describe, expect, it, expectTypeOf } from "vitest"
import { index, service, sleep } from "#index"

describe("awaited: true on param.module()", () => {
    it("awaits an async param implement before a sync dependent factory", async () => {
        const $edition = service("edition").param<{ id: string }>()

        const $fromDb = $edition.module({
            awaited: true,
            factory: async () => {
                await sleep(10)
                return { id: "daily-today" }
            }
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ edition }) => {
                expect(edition).toEqual({ id: "daily-today" })
                return edition.id
            }
        })

        const result = $title.request({}).get()
        expect(result).toBeInstanceOf(Promise)
        expect(await result).toBe("daily-today")
    })

    it("keeps _type as the param type when awaited: true", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $fromDb = $edition.module({
            awaited: true,
            factory: async () => ({ id: "daily-today" })
        })

        expectTypeOf($fromDb._type).toEqualTypeOf<{ id: string }>()
        expect($fromDb._awaited).toBe(true)
    })

    it("type-errors an async factory on a sync param without awaited: true", () => {
        const $edition = service("edition").param<{ id: string }>()

        $edition.module({
            // @ts-expect-error - async factory needs awaited: true on a sync param
            factory: async () => ({ id: "daily-today" })
        })
    })

    it("types .get() as Promise when the team includes an awaited: true module", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $fromDb = $edition.module({
            awaited: true,
            factory: async () => ({ id: "daily-today" })
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ edition }) => edition.id
        })

        const supplier = $title.request({})
        expectTypeOf(supplier.get).returns.toEqualTypeOf<Promise<string>>()
    })

    it("awaits a sibling implement when the dependent required the param", async () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => {
                await sleep(10)
                return { id: "ada" }
            }
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => {
                expect(user).toEqual({ id: "ada" })
                return `hi ${user.id}`
            }
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$greetingImpl],
            factory: ({ greeting }) => greeting.toUpperCase()
        })

        const result = $page.request({}).get()
        expect(result).toBeInstanceOf(Promise)
        expect(await result).toBe("HI ADA")
    })

    it("awaits a sibling implement when the param-dependent is listed first", async () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => {
                await sleep(10)
                return { id: "ada" }
            }
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => {
                expect(user).toEqual({ id: "ada" })
                return `hi ${user.id}`
            }
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$greetingImpl],
            factory: ({ greeting }) => greeting.toUpperCase()
        })

        expect(await $page.request({}).get()).toBe("HI ADA")
    })

    it("awaits a nested sibling implement when another dependent required the param", async () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => {
                await sleep(10)
                return { id: "ada" }
            }
        })

        const $sidebar = service("sidebar").module({
            required: [$fromDb],
            factory: ({ user }) => `side ${user.id}`
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => {
                expect(user).toEqual({ id: "ada" })
                return `hi ${user.id}`
            }
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$sidebar, $greetingImpl],
            factory: ({ sidebar, greeting }) => `${sidebar}/${greeting}`
        })

        expect(await $page.request({}).get()).toBe("side ada/hi ada")
    })

    it("does not unwrap a param whose type is Promise", async () => {
        const $pending = service("pending").param<Promise<string>>()
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => ({ id: "ada" })
        })

        const inner = Promise.resolve("ok")

        const $label = service("label").module({
            required: [$pending, $fromDb],
            factory: ({ pending, user }) => {
                expect(user).toEqual({ id: "ada" })
                expect(pending).toBe(inner)
                return pending
            }
        })

        expect(await $label.request(index($pending.of(inner))).get()).toBe("ok")
    })

    it("stays sync when the param is stamped with a value", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const result = $title
            .request(index($edition.of({ id: "stamped" })))
            .get()

        expectTypeOf(result).toEqualTypeOf<string>()
        expect(result).toBe("stamped")
    })

    it("does not double-wrap .get() when an async factory sits on awaited deps", async () => {
        const $leaf = service("leaf").param<string>()

        const $fromDb = $leaf.module({
            awaited: true,
            factory: async () => {
                await sleep(1)
                return "ok"
            }
        })

        // Required the async *module*. Factory stays async; `_type` may be
        // `Promise<string>`, but `.get()` is still `Promise<string>` once.
        const $jsx = service("jsx").module({
            required: [$fromDb],
            factory: async ({ leaf }) => `node:${leaf}`
        })

        expect($jsx._awaited).toBe(true)

        const result = $jsx.request({}).get()
        expectTypeOf(result).toEqualTypeOf<Promise<string>>()
        expect(result).toBeInstanceOf(Promise)
        expect(await result).toBe("node:ok")
    })

    it("does not double-wrap .get() when hire flips a module awaited", async () => {
        const $dep = service("dep").module({
            awaited: true,
            factory: async () => "dep"
        })

        const $alone = service("alone").module({
            factory: async () => 42
        })
        expectTypeOf($alone._type).toEqualTypeOf<Promise<number>>()

        const hired = $alone.hire($dep)
        expect(hired._awaited).toBe(true)

        const result = hired.request({}).get()
        expectTypeOf(result).toEqualTypeOf<Promise<number>>()
        expect(await result).toBe(42)
    })

    it("exposes supplies as Promise of unwrapped T when the team is awaited", async () => {
        const $leaf = service("leaf").param<string>()

        const $fromDb = $leaf.module({
            awaited: true,
            factory: async () => {
                await sleep(5)
                return "ok"
            }
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ leaf }) => {
                expect(leaf).toBe("ok")
                return leaf.toUpperCase()
            }
        })

        const supplier = $title.request({})

        expectTypeOf(supplier.supplies).toEqualTypeOf<
            Promise<{ leaf: string }>
        >()
        expectTypeOf(supplier.get).returns.toEqualTypeOf<Promise<string>>()

        const bag = await supplier.supplies
        expect(bag.leaf).toBe("ok")
        expect(await supplier.get()).toBe("OK")

        // Shared once with the factory runner.
        expect(await supplier.supplies).toBe(bag)
    })

    it("awaits transitive awaited supplies in the bag", async () => {
        const $leaf = service("leaf").param<string>()

        const $fromDb = $leaf.module({
            awaited: true,
            factory: async () => {
                await sleep(5)
                return "ok"
            }
        })

        const $mid = service("mid").module({
            required: [$fromDb],
            factory: ({ leaf }) => leaf
        })

        const $top = service("top").module({
            required: [$mid],
            factory: ({ mid, leaf }) => {
                expect(leaf).toBe("ok")
                return `${mid}:${leaf}`
            }
        })

        const supplier = $top.request({})
        const bag = await supplier.supplies
        expect(bag.leaf).toBe("ok")
        expect(bag.mid).toBe("ok")
        expect(await supplier.get()).toBe("ok:ok")
    })

    it("accepts a stamp of an awaited required module", async () => {
        const $leaf = service("leaf").module({
            awaited: true,
            factory: async (): Promise<string> => {
                throw new Error("factory should not run")
            }
        })

        const $title = service("title").module({
            required: [$leaf],
            factory: ({ leaf }) => leaf.toUpperCase()
        })

        const supplier = $title.request(index($leaf.of("stamped")))
        expectTypeOf(supplier.get).returns.toEqualTypeOf<Promise<string>>()
        expect(await supplier.get()).toBe("STAMPED")
    })

    it("keeps sync supplies as a plain bag when the team is sync", () => {
        const $name = service("name").param<string>()

        const $greet = service("greet").module({
            required: [$name],
            factory: ({ name }) => `hi ${name}`
        })

        const supplier = $greet.request(index($name.of("ada")))

        expectTypeOf(supplier.supplies).toEqualTypeOf<{ name: string }>()
        expect(supplier.supplies.name).toBe("ada")
        expect(supplier.get()).toBe("hi ada")
    })
})
