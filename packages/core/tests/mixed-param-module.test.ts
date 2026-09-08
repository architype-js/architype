import { describe, expect, it } from "vitest"
import { service, sleep } from "#index"

/**
 * One trademark, one form. When a module fills a param slot, every dependent
 * that declared the *param* keeps the `_awaited` gate it froze at declaration
 * time — params are never awaited — so it runs the sync factory runner and its
 * factory receives the implement's un-awaited Promise. `dedupe` rejects the mix
 * at declaration (or at `hire`) instead of resolving it silently.
 */
describe("param and module for the same trademark in one graph", () => {
    it("rejects a hire that reaches past a param-declaring dependent", async () => {
        const $user = service("user").param<{ id: string }>()

        // Declares the param, has no awaited dep of its own: gate is false.
        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => {
                await sleep(5)
                return { id: "ada" }
            }
        })

        const $page = service("page").module({
            required: [$greeting],
            factory: ({ greeting }) => greeting
        })

        expect($greeting._awaited).toBe(false)
        expect(() =>
            // @ts-expect-error - "user" is a param on this graph
            $page.hire($fromDb)
        ).toThrow(/trademark "user" is a param on this graph/)
    })

    it("rejects a sibling bringing the implement next to a param dependent", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            awaited: true,
            factory: async () => {
                await sleep(5)
                return { id: "ada" }
            }
        })

        const $sidebar = service("sidebar").module({
            required: [$fromDb],
            factory: ({ user }) => `side ${user.id}`
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        // No hire anywhere: the two forms meet in $page's team.
        expect(() =>
            service("page").module({
                // @ts-expect-error - "user" is a param in $greeting, a module in $sidebar
                required: [$sidebar, $greeting],
                factory: () => "page"
            })
        ).toThrow(/param in one/)
    })

    it("names the trademark and the owner in the error", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({ factory: () => ({ id: "ada" }) })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        expect(() =>
            service("page").module({
                // @ts-expect-error - "user" is a param in $greeting, a module in $fromDb
                required: [$fromDb, $greeting],
                factory: () => "page"
            })
        ).toThrow(/page: trademark "user" is a param in one dependency/)
    })

    it("rejects hiring an implement onto the module that declared the param", () => {
        const $user = service("user").param<{ id: string }>()

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $fromDb = $user.module({ factory: () => ({ id: "ada" }) })

        // A param slot takes a value, never a module — even its own implement.
        expect(() =>
            // @ts-expect-error - "user" is a param on this graph
            $greeting.hire($fromDb)
        ).toThrow(/trademark "user" is a param on this graph/)
    })

    it("still hires a module over a module", () => {
        const $user = service("user").module({
            factory: () => ({ id: "real" })
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $mock = $user.mock({ factory: () => ({ id: "ada" }) })

        expect($greeting.hire($mock).request({}).get()).toBe("hi ada")
    })

    it("still stamps a value into a param slot", () => {
        const $user = service("user").param<{ id: string }>()

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $page = service("page").module({
            required: [$greeting],
            factory: ({ greeting }) => greeting
        })

        expect(
            $page.request({ user: $user.of({ id: "ada" }) }).get()
        ).toBe("hi ada")
    })
})
