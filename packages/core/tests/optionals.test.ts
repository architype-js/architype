import { describe, it, expect, assertType, expectTypeOf } from "vitest"
import { index, service } from "#index"

describe("Optionals and Inited Params", () => {
    it("makes a required param optional in the request and falls back to its init value", () => {
        const $config = service("config").param<string>().init("default")

        expect($config._init).toBe("default")

        const $module = service("module").module({
            required: [$config],
            factory: ({ config }) => {
                assertType<string>(config)
                return config
            }
        })

        // Not requested -> falls back to the init value.
        expect($module.request({}).get()).toBe("default")

        // Requested -> overrides the init value.
        expect($module.request(index($config.of("override"))).get()).toBe(
            "override"
        )

        // Providing a wrong type is still a type error.
        expect(
            // @ts-expect-error - invalid type
            $module.request(index($config.of(42))).get()
        ).toBe(42)
    })

    it("keeps non-inited required params required in the request type", () => {
        const $required = service("required").param<string>()
        const $inited = service("inited").param<number>().init(7)

        const $module = service("module").module({
            required: [$required, $inited],
            factory: ({ required, inited }) => `${required}:${inited}`
        })

        // Only the non-inited param is required; inited one is optional.
        expect($module.request(index($required.of("a"))).get()).toBe("a:7")

        // @ts-expect-error - missing the non-inited required param
        $module.request(index($inited.of(1)))
    })

    it("type-checks the init value against the param type", () => {
        // @ts-expect-error - init value must match the param type
        service("config").param<string>().init(123)
    })

    it("provision() resolves inited required params from their init value", () => {
        const $config = service("config").param<string>().init("default")

        const $module = service("module").module({
            required: [$config],
            factory: ({ config }) => `value:${config}`
        })

        const provisioned = $module.provision()

        // No values supplied -> inited required param resolves to its default.
        expect(provisioned.request({}).get()).toBe("value:default")

        // Re-requesting from the provisioned module still allows overriding.
        expect(provisioned.request(index($config.of("override"))).get()).toBe(
            "value:override"
        )
    })
})

describe("Optionals Feature", () => {
    describe("Basic Optional Usage", () => {
        it("should allow defining optional params in module plan", () => {
            const $optional = service("optional").param<string>()

            const $module = service("module").module({
                optionals: [$optional],
                factory: ({ optional }) => {
                    assertType<string | undefined>(optional)
                    return optional
                }
            })

            expect($module._optionals).toEqual([$optional])
            expect($module.request({}).get()).toEqual(undefined)
            expect($module.request(index($optional.of("test"))).get()).toEqual(
                "test"
            )
            expect(
                // @ts-expect-error - invalid type
                $module.request(index($optional.of(55))).get()
            ).toEqual(55)
        })

        it("should work when optional is NOT provided", () => {
            const $config = service("config").param<string>()
            const $optional = service("optional").param<number>()

            const $module = service("module").module({
                required: [$config],
                optionals: [$optional],
                factory: ({ config, optional }) => {
                    return {
                        config,
                        hasOptional: optional !== undefined,
                        optionalValue: optional
                    }
                }
            })

            const result = $module.request(index($config.of("test"))).get()

            expect(result).toEqual({
                config: "test",
                hasOptional: false,
                optionalValue: undefined
            })
        })

        it("should support multiple optionals", () => {
            const $required = service("required").param<string>()
            const $opt1 = service("opt1").param<number>()
            const $opt2 = service("opt2").param<boolean>()
            const $opt3 = service("opt3").param<string>()

            const $module = service("module").module({
                required: [$required],
                optionals: [$opt1, $opt2, $opt3],
                factory: ({ required, opt1, opt2, opt3 }) => {
                    return {
                        required,
                        opt1,
                        opt2,
                        opt3
                    }
                }
            })

            // Provide only some optionals
            const result = $module
                .request(index($required.of("test"), $opt2.of(true)))
                .get()

            expect(result).toEqual({
                required: "test",
                opt1: undefined,
                opt2: true,
                opt3: undefined
            })
        })
    })

    describe("Type Safety with Optionals", () => {
        it("should make optional supplies nullable in supplies type", () => {
            const $required = service("required").param<string>()
            const $optional = service("optional").param<number>()

            const $module = service("module").module({
                required: [$required],
                optionals: [$optional],
                factory: ({ required, optional }) => {
                    // Required service should be non-nullable in deps type
                    assertType<string>(required)
                    assertType<number | undefined>(optional)
                    return "result"
                }
            })

            // Should not require optional in ToSpecify
            $module.request(index($required.of("test"))).get()

            // But should allow it
            $module.request(index($required.of("test"), $optional.of(42)))
        })

        it("should make optional supplies nullable when read from outside the factory", () => {
            const $required = service("required").param<string>()
            const $optional = service("optional").param<number>()

            const $module = service("module").module({
                required: [$required],
                optionals: [$optional],
                factory: ({ required }) => required
            })

            const supplier = $module.request(index($required.of("test")))

            // The supplies type (read outside the factory) must match the
            // factory's deps type exactly: required non-nullable, optional
            // nullable. `toEqualTypeOf` is exact, so a missing `| undefined`
            // (the `-?` undefined-stripping bug) fails the check.
            expectTypeOf(supplier.supplies.required).toEqualTypeOf<string>()
            expectTypeOf(supplier.supplies.optional).toEqualTypeOf<
                number | undefined
            >()

            // _suppliesType is the same type external readers see.
            type Supplies = (typeof $module)["_suppliesType"]
            expectTypeOf<Supplies["required"]>().toEqualTypeOf<string>()
            expectTypeOf<Supplies["optional"]>().toEqualTypeOf<
                number | undefined
            >()
        })

        it("should make optional supplies nullable for a module with only optionals", () => {
            const $opt1 = service("opt1").param<string>()
            const $opt2 = service("opt2").param<number>()

            const $module = service("module").module({
                optionals: [$opt1, $opt2],
                factory: () => "value"
            })

            type Supplies = (typeof $module)["_suppliesType"]
            expectTypeOf<Supplies["opt1"]>().toEqualTypeOf<string | undefined>()
            expectTypeOf<Supplies["opt2"]>().toEqualTypeOf<number | undefined>()
        })

        it("should require all required params in request", () => {
            const $required = service("required").param<string>()
            const $optional = service("optional").param<number>()

            const $service = service("service").module({
                required: [$required],
                optionals: [$optional],
                factory: ({ required, optional }) => {
                    assertType<string>(required)
                    assertType<number | undefined>(optional)
                    return "result"
                }
            })

            expect(
                // @ts-expect-error - missing required service
                $service.request(index($optional.of(42))).get()
            ).toBe("result")

            // Should work without optional
            $service.request(index($required.of("test"))).get()
        })
    })

    describe("Param in ctx wrapper", () => {
        it("should just return param (noop)", () => {
            const $param = service("param").param<string>()
            const $contextual = service("contextual").module({
                factory: () => "value"
            })

            const $module = service("module").module({
                optionals: [$param],
                factory: (deps, ctx) => {
                    // Both should be in ctx
                    expect(ctx($param)).toBe($param)
                    expect(ctx($contextual).tm).toBe($contextual.tm)
                }
            })

            $module.request({}).get()
        })
    })

    describe("Optionals with Nested Dependencies", () => {
        it("should handle optionals in nested module chains", () => {
            const $optionalConfig = service("optionalConfig").param<{
                apiKey: string
            }>()
            const $baseConfig = service("baseConfig").param<{
                url: string
            }>()

            const $api = service("api").module({
                required: [$baseConfig],
                optionals: [$optionalConfig],
                factory: ({ baseConfig, optionalConfig }) => {
                    return {
                        url: baseConfig.url,
                        apiKey: optionalConfig?.apiKey ?? "default-key"
                    }
                }
            })

            const $app = service("app").module({
                required: [$api],
                factory: ({ api }) => {
                    return `Connecting to ${api.url} with ${api.apiKey}`
                }
            })

            // Without optional
            const result1 = $app
                .request(
                    index($baseConfig.of({ url: "https://api.example.com" }))
                )
                .get()
            expect(result1).toBe(
                "Connecting to https://api.example.com with default-key"
            )

            // With optional
            const result2 = $app
                .request(
                    index(
                        $baseConfig.of({ url: "https://api.example.com" }),
                        $optionalConfig.of({ apiKey: "secret-123" })
                    )
                )
                .get()
            expect(result2).toBe(
                "Connecting to https://api.example.com with secret-123"
            )
        })

        it("should propagate optionals through transitive dependencies in types", () => {
            const $optional = service("optional").param<string>()

            const $child = service("child").module({
                optionals: [$optional],
                factory: ({ optional }) => {
                    return optional ?? "default"
                }
            })

            const $parent = service("parent").module({
                required: [$child],
                factory: ({ child }) => {
                    return child
                }
            })

            // Should not require optional
            const result1 = $parent.request({}).get()
            expect(result1).toBe("default")

            // Should accept optional
            const result2 = $parent.request(index($optional.of("custom"))).get()
            expect(result2).toBe("custom")

            // Should accept optional but type-check it if provided
            // @ts-expect-error - invalid optional type
            const result4 = $parent.request(index($optional.of(55))).get()
            expect(result4).toBe(55)
        })

        it("keeps transitive optionals optional in parent supplies unless listed in required", () => {
            const $authUser = service("authUser").param<{ id: string }>()

            const $community = service("community").module({
                optionals: [$authUser],
                factory: ({ authUser }) => authUser?.id ?? "anon"
            })

            // Parent depends on a module that has $authUser optional, but does
            // not redeclare $authUser. The optional must stay optional in the
            // parent's supplies — it must NOT be promoted to required.
            const $featured = service("featured").module({
                required: [$community],
                factory: ({ community }) => community
            })

            type FeaturedSupplies = (typeof $featured)["_suppliesType"]

            expectTypeOf<FeaturedSupplies["community"]>().toEqualTypeOf<string>()
            expectTypeOf<FeaturedSupplies["authUser"]>().toEqualTypeOf<
                { id: string } | undefined
            >()

            const supplier = $featured.request({})
            expectTypeOf(supplier.supplies.authUser).toEqualTypeOf<
                { id: string } | undefined
            >()

            // Runtime: optional may be omitted.
            expect(supplier.get()).toBe("anon")
            expect(
                $featured.request(index($authUser.of({ id: "u1" }))).get()
            ).toBe("u1")

            // Explicitly listing the param in required is what makes it required.
            const $featuredRequiringAuth = service(
                "featuredRequiringAuth"
            ).module({
                required: [$community, $authUser],
                factory: ({ community, authUser }) => {
                    assertType<{ id: string }>(authUser)
                    return `${community}:${authUser.id}`
                }
            })

            type RequiringSupplies =
                (typeof $featuredRequiringAuth)["_suppliesType"]
            expectTypeOf<RequiringSupplies["authUser"]>().toEqualTypeOf<{
                id: string
            }>()

            // @ts-expect-error - authUser is now explicitly required
            $featuredRequiringAuth.request({})

            expect(
                $featuredRequiringAuth
                    .request(index($authUser.of({ id: "u1" })))
                    .get()
            ).toBe("u1:u1")
        })
    })

    describe("Optionals with Mocks", () => {
        it("should allow mocks to have different optionals", () => {
            const $required = service("required").param<string>()
            const $optional1 = service("optional1").param<number>()
            const $optional2 = service("optional2").param<number>()

            const $base = service("base").module({
                required: [$required],
                optionals: [$optional1],
                factory: ({ required, optional1 }) => {
                    return {
                        required,
                        value: optional1 ?? 0
                    }
                }
            })

            const $mocked = $base.mock({
                required: [$required],
                optionals: [$optional2],
                factory: ({ required, optional2 }) => {
                    return {
                        required,
                        value: (optional2 ?? 0) * 2
                    }
                }
            })

            const result = $mocked
                .request(index($required.of("test"), $optional2.of(21)))
                .get()

            expect(result).toEqual({
                required: "test",
                value: 42
            })
        })

        it("should handle optionals with hire method", () => {
            const $config = service("config").param<string>()
            const $optional = service("optional").param<number>()

            const $dependency = service("dependency").module({
                required: [$config],
                optionals: [$optional],
                factory: ({ optional }) => {
                    const opt = optional
                    return opt ? opt * 2 : 0
                }
            })

            const $main = service("main").module({
                required: [$dependency],
                factory: ({ dependency }) => dependency
            })

            const $mockDep = $dependency.mock({
                factory: () => 100
            })

            const $hired = $main.hire($mockDep)

            const result = $hired.request({}).get()
            expect(result).toBe(100)
        })
    })

    describe("Optionals with Ctx", () => {
        it("should allow overriding optional when it was initially provided", () => {
            const $config = service("config").param<string>()
            const $optional1 = service("optional1").param<number>()
            const $optional2 = service("optional2").param<number>()

            const $module = service("module").module({
                required: [$config],
                optionals: [$optional1, $optional2],
                factory: ({ config, optional1, optional2 }) => {
                    return {
                        config: config,
                        ...(optional1 ? { optional1 } : {}),
                        ...(optional2 ? { optional2 } : {})
                    }
                }
            })

            const $main = service("main").module({
                required: [$module],
                factory: ({ module }, ctx) => {
                    const initial = module
                    expect(initial).toEqual({
                        config: "initial"
                    })

                    const modified = ctx($module)
                        .request(index($optional2.of(50)))
                        .get()
                    expect(modified).toEqual({
                        config: "initial",
                        optional2: 50
                    })
                }
            })

            $main.request(index($config.of("initial"))).get()
        })

        it("should allow removing optional in ctx", () => {
            const $config = service("config").param<string>()
            const $optional = service("optional").param<number>()

            const $module = service("module").module({
                required: [$config],
                optionals: [$optional],
                factory: ({ config, optional }) => ({
                    config,
                    optional: optional ?? 0
                })
            })

            const $main = service("main").module({
                required: [$module],
                factory: ({ module }, ctx) => {
                    const initial = module
                    expect(initial).toEqual({
                        config: "test",
                        optional: 42
                    })

                    const reassembled = ctx($module)
                        .request({ [$optional.tm]: undefined })
                        .get()
                    expect(reassembled).toEqual({
                        config: "test",
                        optional: 0
                    })
                }
            })

            $main.request(index($config.of("test"), $optional.of(42))).get()
        })
    })

    describe("Optionals with .hire() Method", () => {
        it("should handle optionals when using .hire() for batch calling", () => {
            const $optional1 = service("optional1").param<string>()
            const $optional2 = service("optional2").param<string>()

            const $module1 = service("module1").module({
                optionals: [$optional1],
                factory: ({ optional1 }) => {
                    return `S1: ${optional1 ?? "none"}`
                }
            })

            const $module2 = service("module2").module({
                optionals: [$optional2],
                factory: ({ optional2 }) => {
                    return `S2: ${optional2 ?? "none"}`
                }
            })

            const batchSupplier = $module1
                .hire($module2)
                .request(index($optional1.of("test")))

            expect(batchSupplier.get()).toBe("S1: test")
            expect(batchSupplier.supplies[$module2.tm]).toBe("S2: none")
        })
    })

    describe("Edge Cases and Error Handling", () => {
        it("should handle empty optionals array", () => {
            const $config = service("config").param<string>()

            const $module = service("module").module({
                required: [$config],
                optionals: [],
                factory: ({ config }) => config
            })

            const result = $module.request(index($config.of("test"))).get()
            expect(result).toBe("test")
        })

        it("should handle module with only optionals (no required params)", () => {
            const $optional1 = service("optional1").param<string>()
            const $optional2 = service("optional2").param<number>()

            const $module = service("module").module({
                optionals: [$optional1, $optional2],
                factory: ({ optional1, optional2 }) => {
                    return {
                        opt1: optional1,
                        opt2: optional2
                    }
                }
            })

            // Should work with no supplies at all
            const result1 = $module.request({}).get()
            expect(result1).toEqual({
                opt1: undefined,
                opt2: undefined
            })

            // Should work with some optionals
            const result2 = $module.request(index($optional1.of("hello"))).get()
            expect(result2).toEqual({
                opt1: "hello",
                opt2: undefined
            })

            // Should work with all optionals
            const result3 = $module
                .request(index($optional1.of("hello"), $optional2.of(42)))
                .get()
            expect(result3).toEqual({
                opt1: "hello",
                opt2: 42
            })
        })

        it("should handle warmup function with optionals", () => {
            const $optional = service("optional").param<number>()
            let optStore: number | undefined = undefined

            const $module = service("module").module({
                optionals: [$optional],
                factory: ({ optional }) => {
                    return optional ?? 10
                },
                warmup: (module, { optional }) => {
                    optStore = optional
                }
            })

            const result1 = $module.request({}).get()
            expect(result1).toBe(10)
            expect(optStore).toEqual(undefined)

            const result2 = $module.request(index($optional.of(5))).get()
            expect(result2).toBe(5)
            expect(optStore).toEqual(5)
        })
    })

    describe("Real-World Use Cases", () => {
        it("Feature flag example", () => {
            const $featureFlag = service("featureFlag").param<boolean>()

            const $session = service("session").param<string>()

            const $optionalFeature = service("optionalFeature").module({
                required: [$session],
                factory: ({ session }) => {
                    return session
                }
            })

            const $main = service("main").module({
                optionals: [$featureFlag],
                factory: ({ featureFlag }, ctx) => {
                    const enabled = featureFlag

                    if (enabled) {
                        // Assemble the optional feature with the optional context
                        const feature = ctx($optionalFeature)
                            .request(index($session.of("userA")))
                            .get()
                        return feature
                    }

                    return undefined
                }
            })

            // Without optional context
            const $result1 = $main.request(index($featureFlag.of(true)))
            expect($result1.get()).toEqual("userA")

            // With optional context
            const $result2 = $main.request(index())
            expect($result2.get()).toEqual(undefined)
        })

        it("should support optional authentication/authorization context", () => {
            const $publicData = service("publicData").param<{
                title: string
            }>()

            const $userAuth = service("userAuth").param<{
                userId: string
                token: string
            }>()

            const $api = service("api").module({
                required: [$publicData],
                optionals: [$userAuth],
                factory: ({ publicData, userAuth }) => {
                    const data = publicData
                    const auth = userAuth

                    return {
                        getPublic: () => data.title,
                        getPrivate: () => {
                            if (!auth) {
                                throw new Error("Not authenticated")
                            }
                            return `${data.title} - User: ${auth.userId}`
                        }
                    }
                }
            })

            // Public access
            const $publicApi = $api.request(
                index($publicData.of({ title: "Hello World" }))
            )
            expect($publicApi.get().getPublic()).toBe("Hello World")
            expect(() => $publicApi.get().getPrivate()).toThrow(
                "Not authenticated"
            )

            // Authenticated access
            const $authApi = $api.request(
                index(
                    $publicData.of({ title: "Hello World" }),
                    $userAuth.of({ userId: "user123", token: "abc" })
                )
            )
            expect($authApi.get().getPublic()).toBe("Hello World")
            expect($authApi.get().getPrivate()).toBe(
                "Hello World - User: user123"
            )
        })

        it("should support optional caching/performance optimization context", () => {
            const $config = service("config").param<{
                apiUrl: string
            }>()

            const $cache = service("cache").param<Map<string, unknown>>()

            const $data = service("data").module({
                required: [$config],
                optionals: [$cache],
                factory: ({ config, cache }) => {
                    return {
                        fetch: (key: string) => {
                            if (cache?.has(key)) {
                                return { data: cache.get(key), cached: true }
                            }
                            const data = `data-from-${config.apiUrl}-${key}`
                            cache?.set(key, data)
                            return { data, cached: false }
                        }
                    }
                }
            })

            // Without cache
            const dataSupplier = $data.request(
                index($config.of({ apiUrl: "api.example.com" }))
            )
            expect(dataSupplier.get().fetch("user")).toEqual({
                data: "data-from-api.example.com-user",
                cached: false
            })

            // With cache
            const cache = new Map<string, unknown>()
            const dataSupplier2 = $data.request(
                index(
                    $config.of({ apiUrl: "api.example.com" }),
                    $cache.of(cache)
                )
            )
            expect(dataSupplier2.get().fetch("user")).toEqual({
                data: "data-from-api.example.com-user",
                cached: false
            })
            expect(dataSupplier2.get().fetch("user")).toEqual({
                data: "data-from-api.example.com-user",
                cached: true
            })
        })
    })
})
