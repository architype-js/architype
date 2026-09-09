import { describe, expect, it } from "vitest"
import { service, index } from "#index"

/**
 * Hire overwrites a param of the same trademark (shallow). Stamp `.of` on
 * the module. A mixed plan — param form and module form in one team — is
 * MixedFormError and a runtime throw.
 */
describe("module overwrites param of the same trademark", () => {
    it("hires an implement onto a graph that declared the param", () => {
        const $user = service("user").param<{ id: string }>()

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        expect($greeting.hire($fromDb).request({}).get()).toBe("hi ada")
    })

    it("type-errors a plan that requireds a param-child and an implement-child", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        const $sidebar = service("sidebar").module({
            required: [$fromDb],
            factory: ({ user }) => `side ${user.id}`
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        expect(() =>
            service("page").module({
                // @ts-expect-error - MixedFormError
                required: [$sidebar, $greeting],
                factory: () => ""
            })
        ).toThrow(
            'Trademark "user" is a param in one dependency and a module in another'
        )

        expect(() =>
            service("pageFirst").module({
                // @ts-expect-error - MixedFormError
                required: [$greeting, $sidebar],
                factory: () => ""
            })
        ).toThrow(
            'Trademark "user" is a param in one dependency and a module in another'
        )
    })

    it("type-errors a plan that requireds the implement beside the param-child", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "from-db" })
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        expect(() =>
            service("page").module({
                // @ts-expect-error - MixedFormError
                required: [$fromDb, $greeting],
                factory: () => ""
            })
        ).toThrow(
            'Trademark "user" is a param in one dependency and a module in another'
        )

        expect(() =>
            service("pageFirst").module({
                // @ts-expect-error - MixedFormError
                required: [$greeting, $fromDb],
                factory: () => ""
            })
        ).toThrow(
            'Trademark "user" is a param in one dependency and a module in another'
        )
    })

    it("climbs a hired twin so siblings share the implement form", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        const $sidebar = service("sidebar").module({
            required: [$fromDb],
            factory: ({ user }) => `side ${user.id}`
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$sidebar, $greetingImpl],
            factory: ({ sidebar, greeting }) => `${sidebar}/${greeting}`
        })

        expect($page.request({}).get()).toBe("side ada/hi ada")
        expect(
            $page.request(index($fromDb.of({ id: "bob" }))).get()
        ).toBe("side bob/hi bob")
        expect(
            $page
                .request(
                    // @ts-expect-error - stamp the module, not the param
                    index($user.of({ id: "eve" }))
                )
                .get()
        ).toBe("side eve/hi eve")
    })

    it("climbs a hired twin when the param-graph child is listed first", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        const $sidebar = service("sidebar").module({
            required: [$fromDb],
            factory: ({ user }) => `side ${user.id}`
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$greetingImpl, $sidebar],
            factory: ({ sidebar, greeting }) => `${sidebar}/${greeting}`
        })

        expect($page.request({}).get()).toBe("side ada/hi ada")
        expect(
            $page.request(index($fromDb.of({ id: "bob" }))).get()
        ).toBe("side bob/hi bob")
    })

    it("uses the hired twin when the implement is a direct sibling", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "from-db" })
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $greetingImpl = $greeting.hire($fromDb)

        const $page = service("page").module({
            required: [$greetingImpl],
            factory: ({ greeting }) => greeting
        })

        expect($page.request({}).get()).toBe("hi from-db")
    })

    it("types the request slot as the module after overwrite", () => {
        const $user = service("user").param<{ id: string }>()

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        const hired = $greeting.hire($fromDb)

        expect(hired.request(index($fromDb.of({ id: "bob" }))).get()).toBe(
            "hi bob"
        )

        expect(
            hired
                .request(
                    // @ts-expect-error - stamp the module, not the param
                    index($user.of({ id: "eve" }))
                )
                .get()
        ).toBe("hi eve")
    })

    it("throws when hiring the implement onto a parent that still requireds the param-graph child", () => {
        const $user = service("user").param<{ id: string }>()

        const $fromDb = $user.module({
            factory: () => ({ id: "ada" })
        })

        const $greeting = service("greeting").module({
            required: [$user],
            factory: ({ user }) => `hi ${user.id}`
        })

        const $page = service("page").module({
            required: [$greeting],
            factory: ({ greeting }) => greeting
        })

        expect(() => $page.hire($fromDb)).toThrow(
            'Trademark "user" is a param in one dependency and a module in another'
        )
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
