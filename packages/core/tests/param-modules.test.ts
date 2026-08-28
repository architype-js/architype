import { describe, expect, it, vi, expectTypeOf } from "vitest"
import { index, service } from "#index"
import { dummyValueCacher } from "./helpers/dummy-cachers"

const serializer = (value: unknown) => JSON.stringify(value)
const valueCaching = {
    cacher: dummyValueCacher(),
    serializer
}

describe("param modules (DI)", () => {
    it("declares a param that can be filled by a chained module", () => {
        const $edition = service("edition").param<{ id: string }>()

        expect($edition.tm).toBe("edition")
        expect($edition._param).toBe(true)
        expect($edition._inited).toBe(false)
    })

    it("resolves after hiring a param.module() implement", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const $fromDb = $edition.module({
            factory: () => ({ id: "daily-today" })
        })

        expect($fromDb._implementId).toEqual(expect.any(String))
        expect($title.hire($fromDb).request({}).get()).toBe("daily-today")
    })

    it("keeps a hired module when a later hire re-lists the param in its team", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const $fromDb = $edition.module({
            factory: () => ({ id: "daily-today" })
        })

        const $spotBids = service("spotBids").module({
            required: [$edition],
            factory: ({ edition }) => [edition.id]
        })
        const $currentBid = service("currentBid").module({
            required: [$spotBids],
            factory: ({ spotBids }) => spotBids[0]
        })

        expect(
            $title.hire($fromDb, $currentBid).request({}).get()
        ).toBe("daily-today")
    })

    it("type-errors request() until the param is filled with .of() or hire", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        // @ts-expect-error - Property 'edition' is missing
        $title.request({})

        expect(
            $title.request(index($edition.of({ id: "stamped" }))).get()
        ).toBe("stamped")

        const $fromDb = $edition.module({
            factory: () => ({ id: "daily-today" })
        })

        const hired = $title.hire($fromDb)
        expectTypeOf(hired.request({})).not.toEqualTypeOf<never>()
        expect(hired.request({}).get()).toBe("daily-today")
    })

    it("lets hire fill one param while request() still requires the rest", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $now = service("now").param<() => string>()

        const $fraction = service("fraction").module({
            required: [$edition, $now],
            factory: ({ edition, now }) => edition.id + now()
        })

        const $fromDb = $edition.module({
            factory: () => ({ id: "e1" })
        })

        const hired = $fraction.hire($fromDb)

        // @ts-expect-error - Property 'now' is missing
        hired.request({})

        expect(hired.request(index($now.of(() => "t"))).get()).toBe("e1t")

        const $clock = $now.module({
            factory: () => () => "t"
        })

        expect($fraction.hire($fromDb, $clock).request({}).get()).toBe("e1t")
    })

    it("type-errors request() for transitive params required by any hired module", () => {
        const $rangeCursor = service("rangeCursor").param<{ start: string }>()
        const $minBidParam = service("minBid").param<string>()

        const $minBid = $minBidParam.module({
            required: [$rangeCursor],
            factory: ({ rangeCursor }) => rangeCursor.start
        })

        const $createPost = service("createPost").module({
            factory: () => "post"
        })

        const $postBid = service("postBid").module({
            required: [$minBidParam],
            factory: ({ minBid }) => minBid
        })

        const hired = $postBid.hire($minBid, $createPost)

        // @ts-expect-error - Property 'rangeCursor' is missing
        hired.request({})

        expect(
            hired.request(index($rangeCursor.of({ start: "s" }))).get()
        ).toBe("s")
    })

    it("accumulates open params across chained hire() calls", () => {
        const $rangeCursor = service("rangeCursor").param<{ start: string }>()
        const $minBidParam = service("minBid").param<string>()

        const $minBid = $minBidParam.module({
            required: [$rangeCursor],
            factory: ({ rangeCursor }) => rangeCursor.start
        })

        const $createPost = service("createPost").module({
            factory: () => "post"
        })

        const $postBid = service("postBid").module({
            required: [$minBidParam],
            factory: ({ minBid }) => minBid
        })

        const chained = $postBid.hire($minBid).hire($createPost)

        // @ts-expect-error - Property 'rangeCursor' is missing
        chained.request({})

        expect(
            chained.request(index($rangeCursor.of({ start: "s" }))).get()
        ).toBe("s")

        const $fromRoute = $rangeCursor.module({
            factory: () => ({ start: "route" })
        })

        expect(chained.hire($fromRoute).request({}).get()).toBe("route")
    })

    it("wires a shared module through a hired next module at the entry-point", () => {
        const $edition = service("edition").param<{
            start: string
            end: string
        } | null>()
        const $now = service("now").module({
            factory: (): (() => string) => () => "2026-08-13T12:00:00.000Z"
        })

        const $remaining = service("remaining").module({
            required: [$edition, $now],
            factory: ({ edition, now }) => {
                if (!edition) return 0
                const start = new Date(edition.start).getTime()
                const end = new Date(edition.end).getTime()
                const t = new Date(now()).getTime()
                return (end - t) / (end - start)
            }
        })

        const $page = service("page").module({
            required: [$remaining],
            factory: ({ remaining }) => remaining
        })

        const $editionFromRoute = $edition.module({
            factory: () => ({
                start: "2026-08-13T00:00:00.000Z",
                end: "2026-08-14T00:00:00.000Z"
            })
        })

        expect($page.hire($editionFromRoute).request({}).get()).toBe(0.5)
    })

    it("does not serialize factory-resolved module values into cache keys", () => {
        const serializerFn = vi.fn((value: unknown) => JSON.stringify(value))
        const caching = {
            cacher: dummyValueCacher(),
            serializer: serializerFn
        }

        const $now = service("now").param<() => string>()
        const nowFactory = vi.fn(() => () => "tick")

        const $clock = $now.module({
            factory: nowFactory
        })

        const leafFactory = vi.fn(({ now }: { now: () => string }) => ({
            sample: now(),
            token: Symbol("cached")
        }))

        const $cached = service("cachedWithNow")
            .module({
                required: [$now],
                factory: leafFactory
            })
            .caching(caching)

        const first = $cached.hire($clock).request({}).get()
        const second = $cached.hire($clock).request({}).get()

        expect(second).toBe(first)
        expect(leafFactory).toHaveBeenCalledTimes(1)
        expect(nowFactory).toHaveBeenCalledTimes(1)
        expect(serializerFn).not.toHaveBeenCalled()
    })

    it("serializes stamped .of() values into the cache key", () => {
        const serializerFn = vi.fn((value: unknown) => JSON.stringify(value))
        const caching = {
            cacher: dummyValueCacher(),
            serializer: serializerFn
        }

        const $edition = service("edition").param<{ id: string }>()
        const factory = vi.fn(({ edition }: { edition: { id: string } }) => ({
            edition,
            token: Symbol("cached")
        }))

        const $cached = service("cachedStampedEdition")
            .module({
                required: [$edition],
                factory
            })
            .caching(caching)

        const first = $cached.request(index($edition.of({ id: "a" }))).get()
        const second = $cached.request(index($edition.of({ id: "b" }))).get()

        expect(second).not.toBe(first)
        expect(first.edition.id).toBe("a")
        expect(second.edition.id).toBe("b")
        expect(factory).toHaveBeenCalledTimes(2)
        expect(serializerFn).toHaveBeenCalled()
    })

    it("keys cache entries by hired module identity, not the param declaration", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $fromA = $edition.module({
            factory: () => ({ id: "a" })
        })
        const $fromB = $edition.module({
            factory: () => ({ id: "b" })
        })

        const factory = vi.fn(({ edition }: { edition: { id: string } }) => ({
            edition,
            token: Symbol("cached")
        }))

        const $cached = service("cachedEdition")
            .module({
                required: [$edition],
                factory
            })
            .caching(valueCaching)

        const first = $cached.hire($fromA).request({}).get()
        const second = $cached.hire($fromB).request({}).get()

        expect(second).not.toBe(first)
        expect(first.edition.id).toBe("a")
        expect(second.edition.id).toBe("b")
        expect(factory).toHaveBeenCalledTimes(2)
    })

    it("gives a mock of a param.module() its own cache identity", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $fromDb = $edition.module({
            factory: () => ({ id: "a" })
        })
        const $mocked = $fromDb.mock({
            factory: () => ({ id: "a" })
        })

        expect($mocked._implementId).not.toBe($fromDb._implementId)

        const factory = vi.fn(({ edition }: { edition: { id: string } }) => ({
            edition,
            token: Symbol("cached")
        }))

        const $cached = service("cachedMockedEdition")
            .module({
                required: [$edition],
                factory
            })
            .caching(valueCaching)

        const first = $cached.hire($fromDb).request({}).get()
        const second = $cached.hire($mocked).request({}).get()

        expect(second).not.toBe(first)
        expect(factory).toHaveBeenCalledTimes(2)
    })

    it("invalidates downstream cache keys when a cached param.module version bumps", () => {
        const $edition = service("edition").param<{ id: string }>()

        const fromDbFactory = vi.fn(() => ({ id: "n1" }))
        const $fromDb = $edition
            .module({
                factory: fromDbFactory
            })
            .caching(valueCaching)

        const rootFactory = vi.fn(
            ({ edition }: { edition: { id: string } }) => ({
                edition,
                token: Symbol("root")
            })
        )

        const $root = service("rootWithEdition")
            .module({
                required: [$edition],
                factory: rootFactory
            })
            .caching(valueCaching)

        const first = $root.hire($fromDb).request({}).get()
        const second = $root.hire($fromDb).request({}).get()

        expect(second).toBe(first)
        expect(fromDbFactory).toHaveBeenCalledTimes(1)
        expect(rootFactory).toHaveBeenCalledTimes(1)

        $fromDb.invalidate()

        const third = $root.hire($fromDb).request({}).get()
        expect(third).not.toBe(first)
        expect(fromDbFactory).toHaveBeenCalledTimes(2)
        expect(rootFactory).toHaveBeenCalledTimes(2)
    })

    it("lets a param.module declare its own params", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $editionId = service("editionId").param<string>()

        const $fromId = $edition.module({
            required: [$editionId],
            factory: ({ editionId }) => ({ id: editionId })
        })

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        expect(
            $title
                .hire($fromId)
                .request(index($editionId.of("daily-today")))
                .get()
        ).toBe("daily-today")
    })

    it("nested ctx still requires params the parent did not provide", () => {
        const $edition = service("edition").param<{ id: string }>()

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const $fromDb = $edition.module({
            factory: () => ({ id: "hired" })
        })

        const $page = service("page").module({
            factory: (_, ctx) =>
                ctx($title)
                    .request(
                        // @ts-expect-error - Property 'edition' is missing
                        {}
                    )
                    .get()
        })

        // Missing param is a type error; at runtime the factory fails when it
        // touches the undefined value.
        expect(() => $page.request({}).get()).toThrow()

        const $stamped = service("stamped").module({
            factory: (_, ctx) =>
                ctx($title)
                    .request(index($edition.of({ id: "nested" })))
                    .get()
        })
        expect($stamped.request({}).get()).toBe("nested")

        const $hired = service("hiredPage").module({
            factory: (_, ctx) => ctx($title).hire($fromDb).request({}).get()
        })
        expect($hired.request({}).get()).toBe("hired")
    })

    it("nested hire does not re-require params the parent already has", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $spotId = service("spotId").param<string>()
        const $priorValue = service("priorValue").param<string>()

        const $date = service("date").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const $fromSpot = $priorValue.module({
            required: [$date],
            factory: ({ date }) => date
        })

        const $spot = service("spot").module({
            required: [$spotId, $priorValue],
            factory: ({ spotId, priorValue }) => `${spotId}:${priorValue}`
        })

        const $section = service("section").module({
            required: [$date],
            factory: ({ date }, ctx) =>
                `${date}/${ctx($spot)
                    .hire($fromSpot)
                    .request(index($spotId.of("s1")))
                    .get()}`
        })

        const $fromDb = $edition.module({
            factory: () => ({ id: "e1" })
        })

        expect($section.hire($fromDb).request({}).get()).toBe("e1/s1:e1")
    })

    it("lets nested ctx requests inherit the parent's hired module", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $editionId = service("editionId").param<string>()

        const $fromId = $edition.module({
            required: [$editionId],
            factory: ({ editionId }) => ({ id: editionId })
        })

        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })

        const $page = service("page").module({
            required: [$title],
            factory: ({ title }, ctx) =>
                `${title}/${ctx($title).request(index()).get()}`
        })

        expect(
            $page
                .hire($fromId)
                .request(index($editionId.of("daily-today")))
                .get()
        ).toBe("daily-today/daily-today")
    })

    it("rejects param.module plans whose value type does not extend the param", () => {
        const $edition = service("edition").param<{ id: string }>()

        $edition.module({
            // @ts-expect-error - number is not assignable to { id: string }
            factory: () => 1
        })
    })
})

describe("param validation", () => {
    it("allows params in required arrays", () => {
        const $edition = service("edition").param<{ id: string }>()
        const $title = service("title").module({
            required: [$edition],
            factory: ({ edition }) => edition.id
        })
        expect($title.tm).toBe("title")
    })
})
