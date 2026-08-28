import { describe, expect, it, vi } from "vitest"
import { index, service } from "#index"
import { dummyValueCacher, dummyResourceCacher } from "./helpers/dummy-cachers"

const serializer = (value: unknown) => JSON.stringify(value)

const valueCaching = {
    cacher: dummyValueCacher(),
    serializer
}

const resourceCaching = {
    cacher: dummyResourceCacher(),
    serializer
}

describe("caching", () => {
    describe("_requested flag", () => {
        it("sets _requested true for explicit .of() stamps", () => {
            const $id = service("id").param<string>()
            const $mod = service("mod").module({
                required: [$id],
                factory: ({ id }) => id
            })

            const supplier = $mod.request(index($id.of("a")))
            expect(supplier.market.id._requested).toBe(true)
            expect($id.of("a")._requested).toBe(true)
        })

        it("sets _requested true for init soft-fill (via .of(_init))", () => {
            const $config = service("config").param<string>().init("default")
            const $mod = service("modWithInit").module({
                required: [$config],
                factory: ({ config }) => config
            })

            const supplier = $mod.request({})
            expect(supplier.market.config._requested).toBe(true)
            expect(supplier.market.config.get()).toBe("default")
        })

        it("sets _requested true for omitted optional params soft-filled with of(_init)", () => {
            const $optional = service("optional").param<number>()
            const $mod = service("modOptional").module({
                optionals: [$optional],
                factory: ({ optional }) => optional ?? -1
            })

            const supplier = $mod.request({})
            expect(supplier.market.optional._requested).toBe(true)
            expect(supplier.market.optional.get()).toBeUndefined()
        })

        it("sets _requested false for factory-resolved modules", () => {
            const $db = service("db").module({
                factory: () => ({ ok: true })
            })
            const $mod = service("modWithDb").module({
                required: [$db],
                factory: ({ db }) => db
            })

            const supplier = $mod.request({})
            expect(supplier.market.db._requested).toBe(false)
            expect(supplier._requested).toBe(false)
        })

        it("sets _requested true when a module is stamped with .of()", () => {
            const $db = service("db").module({
                factory: () => ({ ok: false })
            })
            const $mod = service("modStampedDb").module({
                required: [$db],
                factory: ({ db }) => db
            })

            const stamped = $db.of({ ok: true })
            expect(stamped._requested).toBe(true)

            const supplier = $mod.request(index(stamped))
            expect(supplier.market.db._requested).toBe(true)
            expect(supplier.market.db.get()).toEqual({ ok: true })
        })
    })

    it("rejects invalidate() on modules without caching", () => {
        const $module = service("uncached").module({
            factory: () => "value"
        })

        expect(() => $module.invalidate()).toThrow(
            'Cannot invalidate "uncached" because invalidate() only applies to cached modules.'
        )
    })

    describe("cache keys", () => {
        it("serializes param dependency values into the cache key", () => {
            const $id = service("id").param<string>()
            const factory = vi.fn(({ id }: { id: string }) => ({
                id,
                token: Symbol("byId")
            }))

            const $cached = service("byId")
                .module({
                    required: [$id],
                    factory
                })
                .caching(valueCaching)

            const firstA = $cached.request(index($id.of("a"))).get()
            const secondA = $cached.request(index($id.of("a"))).get()
            const firstB = $cached.request(index($id.of("b"))).get()

            expect(secondA).toBe(firstA)
            expect(firstB).not.toBe(firstA)
            expect(factory).toHaveBeenCalledTimes(2)
        })

        it("keys module deps by identity, not by serializing their values", () => {
            const serializer = vi.fn((value: unknown) => JSON.stringify(value))
            const caching = {
                cacher: dummyValueCacher(),
                serializer
            }

            const handle: { self?: unknown } = {}
            handle.self = handle

            const $db = service("db").module({
                factory: () => handle
            })

            const factory = vi.fn(({ db }: { db: typeof handle }) => ({
                db,
                token: Symbol("cachedWithDb")
            }))

            const $cached = service("cachedWithDb")
                .module({
                    required: [$db],
                    factory
                })
                .caching(caching)

            // Nested request preserves the resolved $db supplier on the caller
            // market — the path that used to JSON.stringify module get() values.
            const $parent = service("parentWithDb").module({
                required: [$db],
                factory: (_supplies, ctx) => ctx($cached).request({}).get()
            })

            const first = $parent.request({}).get()
            const second = $parent.request({}).get()

            expect(second).toBe(first)
            expect(factory).toHaveBeenCalledTimes(1)
            expect(serializer).not.toHaveBeenCalled()
        })
    })

    describe("value", () => {
        it("returns cached values for repeated requests", () => {
            const factory = vi.fn(() => ({ id: Symbol("value") }))

            const $cached = service("cached")
                .module({
                    factory
                })
                .caching(valueCaching)

            const first = $cached.request({}).get()
            const second = $cached.request({}).get()

            expect(second).toBe(first)
            expect(factory).toHaveBeenCalledTimes(1)
        })

        it("invalidates transitive value cache keys when a dependency is invalidated", () => {
            const leafFactory = vi.fn(() => "leaf")
            const rootFactory = vi.fn(({ leaf }) => ({
                leaf,
                id: Symbol("root")
            }))

            const $leaf = service("leaf")
                .module({
                    factory: leafFactory
                })
                .caching(valueCaching)

            const $root = service("root")
                .module({
                    required: [$leaf],
                    factory: rootFactory
                })
                .caching(valueCaching)

            const first = $root.request({}).get()
            const second = $root.request({}).get()

            expect(second).toBe(first)
            expect(leafFactory).toHaveBeenCalledTimes(1)
            expect(rootFactory).toHaveBeenCalledTimes(1)

            $leaf.invalidate()

            const third = $root.request({}).get()
            const fourth = $root.request({}).get()

            expect(third).not.toBe(first)
            expect(fourth).toBe(third)
            expect(leafFactory).toHaveBeenCalledTimes(2)
            expect(rootFactory).toHaveBeenCalledTimes(2)
        })

        it("keeps hired mocks with the same value in separate value cache keys", () => {
            const rootFactory = vi.fn(({ dep }) => ({
                dep,
                id: Symbol("root")
            }))

            const $dep = service("dep").module({
                factory: () => "real"
            })

            const $mockDepA = $dep.mock({
                factory: () => "mock"
            })

            const $mockDepB = $dep.mock({
                factory: () => "mock"
            })

            const $root = service("rootWithMock")
                .module({
                    required: [$dep],
                    factory: rootFactory
                })
                .caching(valueCaching)

            const first = $root.hire($mockDepA).request({}).get()
            const second = $root.hire($mockDepB).request({}).get()

            expect(second).not.toBe(first)
            expect(second.dep).toBe(first.dep)
            expect(rootFactory).toHaveBeenCalledTimes(2)
        })
    })

    describe("resource", () => {
        it("returns cached values for repeated async requests", async () => {
            const factory = vi.fn(async () => ({ id: Symbol("value") }))

            const $cached = service("asyncCached")
                .module({
                    factory
                })
                .caching(resourceCaching)

            const first = await $cached.request({}).get()
            const second = await $cached.request({}).get()

            expect(second).toBe(first)
            expect(factory).toHaveBeenCalledTimes(1)
        })

        it("invalidates transitive resource cache keys when a dependency is invalidated", async () => {
            const leafFactory = vi.fn(async () => "leaf")
            const rootFactory = vi.fn(async ({ asyncLeaf }) => ({
                leaf: asyncLeaf,
                id: Symbol("async-root")
            }))

            const $asyncLeaf = service("asyncLeaf")
                .module({
                    factory: leafFactory
                })
                .caching(resourceCaching)

            const $asyncRoot = service("asyncRoot")
                .module({
                    required: [$asyncLeaf],
                    factory: rootFactory
                })
                .caching(resourceCaching)

            const first = await $asyncRoot.request({}).get()
            const second = await $asyncRoot.request({}).get()

            expect(second).toBe(first)
            expect(leafFactory).toHaveBeenCalledTimes(1)
            expect(rootFactory).toHaveBeenCalledTimes(1)

            $asyncLeaf.invalidate()

            const third = await $asyncRoot.request({}).get()
            const fourth = await $asyncRoot.request({}).get()

            expect(third).not.toBe(first)
            expect(fourth).toBe(third)
            expect(leafFactory).toHaveBeenCalledTimes(2)
            expect(rootFactory).toHaveBeenCalledTimes(2)
        })

        it("works with inline async factory and required deps", () => {
            const $params = service("params").param<Record<string, string>>()

            service("inlineAsyncWithRequired")
                .module({
                    required: [$params],
                    factory: async ({ params }) => params
                })
                .caching(resourceCaching)
        })
    })
})
