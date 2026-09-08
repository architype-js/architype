import { describe, expect, it, expectTypeOf } from "vitest"
import { index, service } from "#index"

describe("maybe: true", () => {
    it("keeps _type as T when the factory returns T | undefined", () => {
        const $card = service("card").param<{ id: string }>()
        const $fromDb = $card.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })

        expectTypeOf($fromDb._type).toEqualTypeOf<{ id: string }>()
        expectTypeOf($fromDb._maybe).toEqualTypeOf<true>()
        expect($fromDb._maybe).toBe(true)
    })

    it("type-errors a factory that may miss without maybe: true", () => {
        const $card = service("card").param<{ id: string }>()

        $card.module({
            // @ts-expect-error - T | undefined needs maybe: true
            factory: () => undefined as { id: string } | undefined
        })
    })

    it("types a required supply as T and throws if the maybe implement misses", () => {
        const $card = service("card").param<{ id: string }>()

        const $fromDb = $card.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ card }) => {
                expectTypeOf(card).toEqualTypeOf<{ id: string }>()
                return card.id
            }
        })

        expectTypeOf($title.request({})).not.toEqualTypeOf<never>()
        expect(() => $title.request({}).get()).toThrow(
            "Dependency card is not available"
        )

        expect(
            $title.request(index($fromDb.of({ id: "stamped" }))).get()
        ).toBe("stamped")
    })

    it("lets an optional consumer see undefined from a maybe implement", () => {
        const $card = service("card").param<{ id: string }>()

        const $fromDb = $card.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })

        const $title = service("title").module({
            optionals: [$fromDb],
            factory: ({ card }) => {
                expectTypeOf(card).toEqualTypeOf<
                    { id: string } | undefined
                >()
                return card?.id ?? "none"
            }
        })

        expect($title.request({}).get()).toBe("none")
    })

    it("keeps _type as T when an awaited implement may miss", async () => {
        const $cardId = service("cardId").param<string>()
        const $card = service("card").param<{ id: string }>()

        const $fromDb = $card.module({
            awaited: true,
            maybe: true,
            required: [$cardId],
            factory: async ({ cardId }) =>
                cardId === "known" ?
                    { id: cardId }
                :   (undefined as { id: string } | undefined)
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ card }) => card.id
        })

        expectTypeOf($fromDb._type).toEqualTypeOf<{ id: string }>()
        expectTypeOf($fromDb._maybe).toEqualTypeOf<true>()

        expect(await $title.request(index($cardId.of("known"))).get()).toBe(
            "known"
        )
        await expect(
            $title.request(index($cardId.of("missing"))).get()
        ).rejects.toThrow("Dependency card is not available")
    })

    it("does not mark a definite implement as maybe", () => {
        const $card = service("card").param<{ id: string }>()

        const $fromDb = $card.module({
            factory: () => ({ id: "daily" })
        })

        const $title = service("title").module({
            required: [$fromDb],
            factory: ({ card }) => card.id
        })

        expectTypeOf($fromDb._maybe).toEqualTypeOf<false>()
        expect($fromDb._maybe).toBe(false)
        expect($title.request({}).get()).toBe("daily")
    })

    it("does not throw when a guest-safe awaited parent optionals a maybe implement", async () => {
        const $authUser = service("authUser").param<{ id: string }>()
        const $fromDb = $authUser.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })
        const $page = service("page").module({
            awaited: true,
            optionals: [$fromDb],
            factory: async ({ authUser }) => authUser?.id ?? "guest"
        })

        expect(await $page.request({}).get()).toBe("guest")
    })

    it("throws when an awaited parent hires a maybe implement without optionals and the factory misses", async () => {
        const $authUser = service("authUser").param<{ id: string }>()
        const $fromDb = $authUser.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })
        const $page = service("page").module({
            awaited: true,
            factory: async () => "home"
        })

        await expect($page.hire($fromDb).request({}).get()).rejects.toThrow(
            "Dependency authUser is not available"
        )
    })

    it("accepts a maybe module in optionals and sees T | undefined", async () => {
        const $supabaseUserId = service("supabaseUserId").module({
            awaited: true,
            maybe: true,
            factory: async () => undefined as string | undefined
        })

        const $authUser = service("authUser").module({
            awaited: true,
            maybe: true,
            optionals: [$supabaseUserId],
            factory: async ({ supabaseUserId }) => {
                expectTypeOf(supabaseUserId).toEqualTypeOf<
                    string | undefined
                >()
                return supabaseUserId
            }
        })

        expect(await $authUser.request({}).get()).toBeUndefined()
        expect(
            await $authUser.request(index($supabaseUserId.of("member"))).get()
        ).toBe("member")
    })

    it("type-errors a definite module in optionals", () => {
        const $db = service("db").module({
            factory: () => "pg"
        })

        expect(() =>
            service("authUser").module({
                // @ts-expect-error - only params and maybe modules in optionals
                optionals: [$db],
                factory: ({ db }) => db
            })
        ).toThrow("db is not a param or maybe module")
    })

    it("unwraps a standalone maybe module's _type", () => {
        const $found = service("found").module({
            maybe: true,
            factory: () => "ok" as string | undefined
        })

        expectTypeOf($found._type).toEqualTypeOf<string>()
        expectTypeOf($found._maybe).toEqualTypeOf<true>()
        expect($found.request({}).get()).toBe("ok")
    })

    it("passes a slot-typed undefined on a required definite param", () => {
        const $note = service("note").param<string | undefined>()
        const $page = service("page").module({
            required: [$note],
            factory: ({ note }) => {
                expectTypeOf(note).toEqualTypeOf<string | undefined>()
                return note ?? "empty"
            }
        })

        expect($page.request(index($note.of(undefined))).get()).toBe("empty")
        expect($page.request(index($note.of("hi"))).get()).toBe("hi")
    })

    it("throws on a maybe implement miss even when the param type includes undefined", () => {
        const $user = service("user").param<{ id: string } | undefined>()
        const $fromDb = $user.module({
            maybe: true,
            factory: () => undefined as { id: string } | undefined
        })
        const $page = service("page").module({
            required: [$fromDb],
            factory: ({ user }) => user?.id ?? "none"
        })

        const $stampedPage = service("stampedPage").module({
            required: [$user],
            factory: ({ user }) => user?.id ?? "none"
        })

        expectTypeOf($fromDb._type).toEqualTypeOf<
            { id: string } | undefined
        >()
        expectTypeOf($fromDb._maybe).toEqualTypeOf<true>()
        expect(() => $page.request({}).get()).toThrow(
            "Dependency user is not available"
        )
        expect(
            $stampedPage.request(index($user.of(undefined))).get()
        ).toBe("none")
    })

    it("does not throw when a definite implement yields slot-typed undefined", () => {
        const $user = service("user").param<{ id: string } | undefined>()
        const $fromDb = $user.module({
            factory: () => undefined as { id: string } | undefined
        })
        const $page = service("page").module({
            required: [$fromDb],
            factory: ({ user }) => user?.id ?? "none"
        })

        expectTypeOf($fromDb._maybe).toEqualTypeOf<false>()
        expect($page.request({}).get()).toBe("none")
    })
})
