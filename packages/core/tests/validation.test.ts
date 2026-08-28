import { describe, it, expect } from "vitest"
import { service } from "#index"

describe("Runtime Validation", () => {
    describe("param()", () => {
        it("should create params and allow specifying values", () => {
            const $value = service("value").param<string>()
            const supplier = $value.of("test")

            expect($value.tm).toBe("value")
            expect(supplier.get()).toBe("test")
        })

        it("should create params that can chain .module()", () => {
            const $edition = service("edition").param<{ id: string }>()
            expect($edition.tm).toBe("edition")
            expect($edition._param).toBe(true)
            const $fromDb = $edition.module({
                factory: () => ({ id: "x" })
            })
            expect($fromDb._implementId).toEqual(expect.any(String))
        })

        it("should enforce runtime module plan validation", () => {
            expect(() => service("test").module({} as any)).toThrow(TypeError)
            expect(() => service("test").module({} as any)).toThrow(
                "test must have a 'factory' property"
            )
        })
    })

    describe("module()", () => {
        it("should throw TypeError when plan is not an object", () => {
            expect(() => service("A").module(null as any)).toThrow(TypeError)
            expect(() => service("B").module(null as any)).toThrow(
                "B must be an object, got null"
            )
        })

        it("should throw TypeError when plan is an array", () => {
            expect(() => service("A").module([] as any)).toThrow(TypeError)
            expect(() => service("B").module([] as any)).toThrow(
                "B must be an object, not an array"
            )
        })

        it("should throw TypeError when factory is missing", () => {
            expect(() => service("A").module({} as any)).toThrow(TypeError)
            expect(() => service("B").module({} as any)).toThrow(
                "B must have a 'factory' property"
            )
        })

        it("should throw TypeError when factory is not a function", () => {
            expect(() =>
                service("A").module({ factory: "not a function" } as any)
            ).toThrow(TypeError)
            expect(() =>
                service("B").module({ factory: "not a function" } as any)
            ).toThrow("B must be a function, got string")
        })

        it("should throw TypeError when required is not an array", () => {
            expect(() =>
                service("A").module({
                    factory: () => ({}),
                    required: "not an array"
                } as any)
            ).toThrow(TypeError)
            expect(() =>
                service("B").module({
                    factory: () => ({}),
                    required: "not an array"
                } as any)
            ).toThrow("B must be an array")
        })
    })

    describe("module.call()", () => {
        it("should throw TypeError when request is not an object", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.request(null as any)).toThrow(TypeError)
            expect(() => $resource.request(null as any)).toThrow(
                "request must be an object, got null"
            )
        })

        it("should throw TypeError when request is an array", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.request([] as any)).toThrow(TypeError)
            expect(() => $resource.request([] as any)).toThrow(
                "request must be an object, not an array"
            )
        })
    })

    describe("module.hire()", () => {
        it("should throw TypeError when hired contain invalid items", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.hire(null as any)).toThrow(TypeError)
            expect(() => $resource.hire(null as any)).toThrow(TypeError)
        })

        it("should throw TypeError when module is missing tm property", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.hire({} as any)).toThrow(TypeError)
        })
    })

    describe("module.mock()", () => {
        it("should throw TypeError when plan is not an object", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.mock(null as any)).toThrow(TypeError)
            expect(() => $resource.mock(null as any)).toThrow(
                "resource must be an object, got null"
            )
        })

        it("should throw TypeError when factory is missing", () => {
            const $resource = service("resource").module({
                factory: () => ({})
            })
            expect(() => $resource.mock({} as any)).toThrow(TypeError)
            expect(() => $resource.mock({} as any)).toThrow(
                "resource must have a 'factory' property"
            )
        })
    })
})
