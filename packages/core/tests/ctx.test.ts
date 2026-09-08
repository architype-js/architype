import { describe, it, expect, vi, expectTypeOf } from "vitest"
import { service } from "#index"
import { index, sleep } from "#utils"
import type { Supplier } from "#types/public"

describe("Context Propagation", () => {
    it("ctx should return a service with same name", () => {
        const factoryMock = vi.fn().mockReturnValue("value")

        const $contextual = service("contextual").module({
            factory: factoryMock
        })

        const $main = service("main").module({
            factory: (deps, ctx) => {
                // Contextual services are passed but not auto-assembled
                expect(ctx($contextual).tm).toBe($contextual.tm)
                expect(factoryMock).not.toHaveBeenCalled()

                return "main-result"
            }
        })

        const result = $main.request({}).get()
        expect(result).toBe("main-result")
        expect(factoryMock).not.toHaveBeenCalled()
    })

    it("should require params for hired contextual modules", () => {
        const $param = service("param").param<string>()

        const $contextual1 = service("contextual1").module({
            required: [$param],
            factory: ({ param }) => `A1: ${param}`
        })

        const $contextual2 = service("contextual2").module({
            required: [$param],
            factory: ({ param }) => `A2: ${param}`
        })

        const $base = service("base").module({
            factory: (deps, ctx) => {
                return ctx($contextual1)
                    .request(index($param.of("test")))
                    .get()
            }
        })

        const $extended = $base.hire($contextual2)

        // @ts-expect-error - hired request supplies must be supplied also
        $extended.request({})
        const result = $extended.request(index($param.of("unused"))).get()
        expect(result).toBe("A1: test")
    })

    it("should allow manual contextual module calling within factory", () => {
        const factoryMock = vi.fn().mockReturnValue("value")

        const $contextual = service("contextual").module({
            factory: factoryMock
        })

        const $main = service("main").module({
            factory: (deps, ctx) => {
                const contextualSupplier = ctx($contextual).request({})
                const value = contextualSupplier.get()

                expect(factoryMock).toHaveBeenCalledTimes(1)
                expect(value).toBe("value")

                return {
                    main: "main-result",
                    contextual: value
                }
            }
        })

        const result = $main.request({}).get()
        expect(result).toEqual({
            main: "main-result",
            contextual: "value"
        })
    })

    it("should support conditions based on context (session admin example)", () => {
        const $session = service("session").param<{
            userId: string
            role: string
        }>()

        const $adminSession = service("adminSession").param<{
            userId: string
            role: "admin"
        }>()

        const $adminFeature = service("adminFeature").module({
            //Even if unused, protects this function from being called by non-admins via Typescript
            required: [$adminSession],
            factory: () => "sensitive-admin-data"
        })

        const $userFeature = service("userFeature").module({
            factory: () => "regular-user-data"
        })

        const $main = service("main").module({
            required: [$session, $userFeature],
            factory: ({ session, userFeature }, ctx) => {
                const role = session.role

                if (role === "admin") {
                    const adminFeature = ctx($adminFeature).request(
                        index($adminSession.of({ ...session, role }))
                    )

                    return {
                        user: session.userId,
                        feature: adminFeature.get()
                    }
                } else {
                    return {
                        user: session.userId,
                        feature: userFeature
                    }
                }
            }
        })

        const adminSession = $session.of({
            userId: "admin123",
            role: "admin"
        })
        const adminResult = $main.request(index(adminSession)).get()

        expect(adminResult).toEqual({
            user: "admin123",
            feature: "sensitive-admin-data"
        })

        const userSession = $session.of({
            userId: "user456",
            role: "user"
        })
        const userResult = $main.request(index(userSession)).get()

        expect(userResult).toEqual({
            user: "user456",
            feature: "regular-user-data"
        })
    })

    it("should handle contextual service errors gracefully", () => {
        const $failing = service("failing").module({
            factory: () => {
                throw new Error("Context service failed")
                return
            }
        })

        const $main = service("main").module({
            factory: (supplies, ctx) => {
                ctx($failing).request({}).get()
                return "main"
            }
        })

        expect(() => {
            $main.request({}).get()
        }).toThrow("Context service failed")
    })

    it("should support complex contextual dependency chains", () => {
        const $db = service("db").param<string>()

        const $repository = service("repo").module({
            required: [$db],
            factory: ({ db }) => {
                return "repo-" + db
            }
        })

        const $feature = service("feature").module({
            required: [$repository],
            factory: ({ repo }) => {
                return "feature-" + repo
            }
        })

        const $main = service("main").module({
            factory: (deps, ctx) => {
                const feature = ctx($feature)
                    .request(index($db.of("postgresql://localhost:5432/mydb")))
                    .get()

                return "main-" + feature
            }
        })

        const result = $main.request({}).get()
        expect(result).toEqual(
            "main-feature-repo-postgresql://localhost:5432/mydb"
        )
    })

    it("should properly overwrite param in contextual call()", () => {
        const $number = service("number").param<number>()
        const $doubler = service("doubler").module({
            required: [$number],
            factory: ({ number }) => {
                return number * 2
            }
        })

        const $quadrupler = service("quadrupler").module({
            required: [$doubler],
            factory: ({ doubler }) => {
                return doubler * 2
            }
        })

        const $main = service("main").module({
            required: [$doubler],
            factory: (deps, ctx) => {
                const assembled = ctx($quadrupler)
                    .request(index($number.of(5)))
                    .get()
                return assembled
            }
        })

        const result = $main.request(index($number.of(10))).get()
        expect(result).toEqual(20)
    })

    it("should preserve suppliers from parent requests that don't depend on the new request", async () => {
        const $number = service("number").param<number>()
        const $dummy = service("dummy").module({
            factory: () => "dummy"
        })

        let timesCalled = 0
        const $counter = service("counter").module({
            required: [$dummy],
            factory: ({ dummy }) => {
                return timesCalled++
            }
        })

        const $reassembled = service("reassembled").module({
            required: [$number, $counter],
            factory: ({ number }) => {
                return number
            }
        })

        const $main = service("main").module({
            required: [$dummy, $counter],
            factory: (deps, ctx) => {
                const reassembled = ctx($reassembled)
                    .request(index($number.of(10)))
                    .get()
                const counter = ctx($counter).request({}).get()
                return counter
            }
        })

        $main.request({}).get()
        expect(timesCalled).toEqual(1)
    })

    it("Providing undefined supplier to request() should erase the previous supplier", () => {
        const $number = service("number").param<number>()
        const $username = service("username").module({
            required: [$number],
            factory: ({ number }) => {
                return "John-" + number
            }
        })

        const $greeter = service("greeter").module({
            required: [$username],
            factory: ({ username }) => {
                return "Hello, " + username + "!"
            }
        })

        const $main = service("main").module({
            required: [$number, $username],
            factory: (deps, ctx) => {
                const assembled = ctx($greeter)
                    .request({ [$username.tm]: undefined })
                    .get()
                return assembled
            }
        })

        const result = $main
            .request(index($number.of(10), $username.of("Ted-10")))
            .get()
        expect(result).toEqual("Hello, John-10!")
    })

    it("should support mocks with contextual requests", () => {
        const factoryMock = vi.fn().mockReturnValue("product")

        const $contextual = service("contextual").module({
            factory: factoryMock
        })

        const $base = service("base").module({
            factory: () => "base-value"
        })

        const $mock = $base.mock({
            factory: (deps, ctx) => {
                expect(ctx($contextual).tm).toBe($contextual.tm)

                const assembled = ctx($contextual).request({})
                const product = assembled.get()

                return `mock-${product}`
            }
        })

        const result = $mock.request({}).get()
        expect(result).toBe("mock-product")
        expect(factoryMock).toHaveBeenCalledTimes(1)
    })

    it("should support mocks with multiple contextual requests", () => {
        const ASpy = vi.fn().mockReturnValue("A")
        const BSpy = vi.fn().mockReturnValue("B")

        const $A = service("A").module({
            factory: ASpy
        })

        const $B = service("B").module({
            factory: BSpy
        })

        const $base = service("base").module({
            factory: () => "base-value"
        })

        const $mock = $base.mock({
            factory: (deps, ctx) => {
                const contextualA = ctx($A).request({}).get()
                const contextualB = ctx($B).request({}).get()

                return `base-value-${contextualA}-${contextualB}`
            }
        })

        const result = $mock.request({}).get()
        expect(result).toBe("base-value-A-B")
        expect(ASpy).toHaveBeenCalledTimes(1)
        expect(BSpy).toHaveBeenCalledTimes(1)
    })

    it("should support hire() method with contextual replacement", async () => {
        const originalSpy = vi.fn().mockReturnValue("original")
        const mockSpy = vi.fn().mockReturnValue("mocked")

        const $original = service("original").module({
            factory: originalSpy
        })

        const $mock = $original.mock({
            factory: mockSpy
        })
        const $base = service("base").module({
            factory: (deps, ctx) => {
                return ctx($original).request({}).get()
            }
        })

        const result = $base.hire($mock).request({}).get()

        await sleep(10)

        expect(result).toBe("mocked")
        expect(originalSpy).toHaveBeenCalledTimes(0)
        expect(mockSpy).toHaveBeenCalledTimes(2)
    })

    it("should support empty contextual dependency setup in mocks", () => {
        const $base = service("base").module({
            factory: () => "base-value"
        })

        const $mock = $base.mock({
            factory: () => {
                return "mock-value"
            }
        })

        const result = $mock.request({}).get()
        expect(result).toBe("mock-value")
    })

    it("should handle contextual errors in mocks gracefully", () => {
        const errorSpy = vi.fn().mockImplementation(() => {
            throw new Error("Context service error")
        })

        const $error = service("error").module({
            factory: errorSpy
        })

        const $base = service("base").module({
            factory: () => "base-value"
        })

        const $mock = $base.mock({
            factory: (deps, ctx) => {
                expect(() => {
                    ctx($error).request({}).get()
                }).toThrow("Context service error")
                return "mock-value"
            }
        })

        const result = $mock.request({}).get()
        expect(result).toBe("mock-value")
    })

    it("should handle contextual errors in hire() method gracefully", () => {
        const baseSpy = vi.fn().mockReturnValue("base")
        const errorSpy = vi.fn().mockImplementation(() => {
            throw new Error("Context service error")
        })

        const $base = service("base").module({
            factory: baseSpy
        })

        const $error = $base.mock({
            factory: errorSpy
        })

        const $main = service("main").module({
            factory: (deps, ctx) => {
                expect(() => {
                    ctx($base).request({}).get()
                }).toThrow()
                return "main"
            }
        })

        const $hired = $main.hire($error)

        const result = $hired.request({}).get()
        expect(result).toBe("main")
    })

    it("should support complex contextual dependency chains in mocks", () => {
        const dbSpy = vi.fn().mockReturnValue("db")
        const testSpy = vi.fn().mockReturnValue("test")

        const $config = service("config").param<{ env: string }>()
        const $db = service("db").module({
            required: [$config],
            factory: dbSpy
        })
        const $test = service("test").module({
            required: [$db],
            factory: testSpy
        })

        const $base = service("base").module({
            factory: () => "base"
        })

        const $mock = $base.mock({
            factory: (deps, ctx) => {
                const test = ctx($test)
                    .request(index($config.of({ env: "test" })))
                    .get()

                return `base-${test}`
            }
        })

        const result = $mock.request({}).get()
        expect(result).toBe("base-test")
    })

    it("should error on duplicate contextual service names in hire()", async () => {
        const originalSpy = vi.fn().mockReturnValue("original")
        const overrideSpy = vi.fn().mockReturnValue("override")
        const overrideSpy2 = vi.fn().mockReturnValue("override2")

        const $original = service("duplicate").module({
            factory: originalSpy
        })

        const $override = $original.mock({
            factory: overrideSpy
        })

        const $override2 = $original.mock({
            factory: overrideSpy2
        })

        const $base = service("base").module({
            factory: (deps, ctx) => {
                return ctx($original).request({}).get()
            }
        })

        // @ts-expect-error - DuplicateServiceError
        const $hired = $base.hire($override, $override2)
    })

    describe("Accessing supplies after hire() call in a factory", () => {
        it("supplies of supplier built with hire() should contain only the hired modules' supplies properly typed", () => {
            const $contextual1 = service("contextual1").module({
                factory: () => "contextual1-value"
            })

            const $contextual2 = service("contextual2").module({
                factory: () => "contextual2-value"
            })

            const $main = service("main").module({
                factory: (supplies, ctx) => {
                    const supplier = ctx($contextual1)
                        .hire($contextual2)
                        .request({})

                    expectTypeOf(
                        supplier.market.contextual2
                    ).not.toEqualTypeOf<any>()
                    expectTypeOf(supplier.market.contextual2).toExtend<
                        Supplier<any>
                    >()
                    expect(supplier.market.contextual2.get()).toBe(
                        "contextual2-value"
                    )

                    expectTypeOf(
                        supplier.supplies.contextual2
                    ).not.toEqualTypeOf<any>()
                    expectTypeOf(
                        supplier.supplies.contextual2
                    ).toExtend<string>()
                }
            })

            $main.request({}).get()
        })
    })

    describe("Type-safety of nested ctx().request()", () => {
        it("should properly type the result of nested ctx().request() calls", () => {
            const $paramA = service("paramA").param<string>()
            const $paramB = service("paramB").param<string>()

            const $A = service("A").module({
                required: [$paramA],
                factory: () => {
                    return "A-value"
                }
            })

            const $B = service("B").module({
                required: [$paramA, $paramB],
                factory: ({ paramA, paramB }) => {
                    expect(paramA).toBe("paramA-value")
                    expect(paramB).toBe("paramB-value")
                    return "B-value"
                }
            })

            const $main = service("main").module({
                required: [$A],
                factory: (deps, ctx) => {
                    // @ts-expect-error - param paramB is not supplied
                    ctx($B).request({})
                    // Works, param paramA doesn't need to be supplied, reused from deps
                    ctx($B)
                        .request(index($paramB.of("paramB-value")))
                        .get()
                    return "main-value"
                }
            })

            $main.request(index($paramA.of("paramA-value"))).get()
        })

        it("Calling ctx($service).request() should never require any params to be specified", () => {
            const $param = service("param").param<string>()
            const $product = service("product").module({
                required: [$param],
                factory: ({ param }) => {
                    return param
                }
            })

            const $main = service("main").module({
                required: [$product],
                factory: (supplies, ctx) => {
                    expect(ctx($product).request({}).get()).toBe("param-value")
                }
            })

            $main.request(index($param.of("param-value"))).get()
        })

        it("Calling ctx().hire(mock).request() should be properly typed", () => {
            const $param = service("param").param<string>()
            const $A = service("A").module({
                factory: () => "A-value"
            })

            const $B = service("B").module({
                required: [$A],
                factory: ({ A }) => A
            })

            const $AMock = $A.mock({
                required: [$param],
                factory: () => "AMock-value"
            })

            const $main = service("main").module({
                factory: (deps, ctx) => {
                    const hired = ctx($B).hire($AMock)

                    expect(() =>
                        // @ts-expect-error - param supply is not supplied
                        hired.request({}).get()
                    ).toThrow("Dependency param is not available")
                    expect(
                        hired.request(index($param.of("param-value"))).get()
                    ).toBe("AMock-value")
                }
            })

            $main.request({}).get()
        })
    })
})
