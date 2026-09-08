/**
 * Runtime validation utilities for the trademarks package.
 * These validators help catch common errors for users who don't use TypeScript.
 * @internal
 */

import type { Param, UnknownModule, UnknownService } from "#types/public"

/**
 * Validates that a value is a string.
 * @param name - The parameter name for error messages
 * @param value - The value to validate
 * @internal
 * @throws TypeError if the value is not a string
 */
export function assertString(
    name: string,
    value: unknown
): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError(`${name} must be a string, got ${typeof value}`)
    }
}

/**
 * Validates that a value is a valid trademark name
 * (suitable for use as a variable name or object property name).
 * @param value - The value to validate
 * @internal
 * @throws TypeError if the value is not a valid trademark identifier
 */
export function assertTM(value: string) {
    // JavaScript identifier must start with letter, underscore, or dollar sign
    // and can contain letters, digits, underscores, and dollar signs
    const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

    if (value === "") {
        throw new TypeError(`TM must not be empty`)
    }

    if (!identifierPattern.test(value)) {
        throw new TypeError(
            `${value} trademark contains invalid characters for a JavaScript identifier, or doesn't start with a letter, underscore, or dollar sign`
        )
    }
}
/**
 * Validates that a value is a plain object (not null, array, or other special object).
 * @param name - The parameter name for error messages
 * @param value - The value to validate
 * @internal
 * @throws TypeError if the value is not a plain object
 */
export function assertPlainObject(
    name: string,
    value: unknown
): asserts value is object {
    if (value === null || typeof value !== "object") {
        throw new TypeError(
            `${name} must be an object, got ${
                value === null ? "null" : typeof value
            }`
        )
    }
    if (Array.isArray(value)) {
        throw new TypeError(`${name} must be an object, not an array`)
    }
}

export function assertHasProperty<K extends string, V>(
    name: string,
    value: V,
    property: K
): asserts value is V & { [key in K]: unknown } {
    if (!Object.prototype.hasOwnProperty.call(value, property)) {
        throw new TypeError(`${name} must have a '${property}' property`)
    }
}

/**
 * Validates that a value is a function.
 * @param name - The parameter name for error messages
 * @param value - The value to validate
 * @internal
 * @throws TypeError if the value is not a function
 */
export function assertFunction(
    name: string,
    value: unknown
): asserts value is (...args: unknown[]) => unknown {
    if (typeof value !== "function") {
        throw new TypeError(`${name} must be a function, got ${typeof value}`)
    }
}

/**
 * Validates the plan object for services.
 * @param name - Service name, used in error messages
 * @param plan - The plan object to validate
 * @internal
 * @throws TypeError if the plan is invalid
 */
export function assertModulePlan(
    name: string,
    plan: {
        required?: unknown
        optionals?: unknown
        factory?: unknown
        warmup?: unknown
    }
) {
    assertPlainObject(name, plan)
    assertHasProperty(name, plan, "factory")
    if (plan.factory !== undefined) {
        assertFunction(name, plan.factory)
    }

    const required = plan.required ?? []
    const optionals = plan.optionals ?? []

    assertServices(name, required)
    assertOptionals(name, optionals)

    if (plan.warmup !== undefined) {
        assertFunction(name, plan.warmup)
    }
}

export function assertCachingConfig(name: string, config: unknown) {
    assertPlainObject(`${name}.caching`, config)
    assertHasProperty(`${name}.caching`, config, "cacher")
    assertHasProperty(`${name}.caching`, config, "serializer")
    assertFunction(`${name}.caching`, config.cacher)
    assertFunction(`${name}.caching`, config.serializer)
}

export function assertParam(service: unknown): asserts service is Param {
    assertHasProperty("noname", service, "tm")
    assertString("noname", service.tm)

    assertHasProperty(service.tm, service, "_param")
    if (!service._param) {
        throw new TypeError(`${service.tm} is not a param`)
    }
}

export function assertModule(
    service: unknown,
    allowMocks: boolean = false
): asserts service is UnknownModule {
    assertHasProperty("noname", service, "tm")
    assertString("noname", service.tm)
    assertHasProperty(service.tm, service, "_module")
    assertHasProperty(service.tm, service, "_mock")

    if (
        !allowMocks &&
        "_hired" in service &&
        Array.isArray(service._hired) &&
        service._hired.length > 0
    ) {
        throw new TypeError(`Cannot depend on ${service.tm} service`)
    }

    if (!allowMocks && service._mock) {
        throw new TypeError(`Cannot depend on ${service.tm} mock service`)
    }
}

/**
 * Validates that all items in an array are valid services.
 * @param name - The parameter name for error messages
 * @param services - The services array to validate
 * @param allowMocks - Whether to allow mocks
 * @internal
 * @throws TypeError if any service is invalid
 */
export function assertServices(
    name: string,
    services: unknown,
    allowMocks: boolean = false
): asserts services is UnknownService[] {
    if (!Array.isArray(services)) {
        throw new TypeError(`${name} must be an array`)
    }
    services.forEach((tm) => {
        try {
            assertParam(tm)
            return
        } catch {
            assertModule(tm, allowMocks)
        }
    })
}

export function assertParams(
    name: string,
    params: unknown
): asserts params is Param[] {
    if (!Array.isArray(params)) {
        throw new TypeError(`${name} must be an array`)
    }
    params.forEach((param) => {
        assertParam(param)
    })
}

export function assertOptionals(
    name: string,
    services: unknown
): asserts services is (Param | UnknownModule)[] {
    if (!Array.isArray(services)) {
        throw new TypeError(`${name} must be an array`)
    }
    services.forEach((service) => {
        try {
            assertParam(service)
            return
        } catch {
            assertModule(service)
            if (!service._maybe) {
                throw new TypeError(
                    `${service.tm} is not a param or maybe module`
                )
            }
        }
    })
}

export function assertModules(
    name: string,
    modules: unknown,
    allowMocks: boolean = false
): asserts modules is UnknownModule[] {
    if (!Array.isArray(modules)) {
        throw new TypeError(`${name} must be an array`)
    }
    modules.forEach((service) => {
        assertModule(service, allowMocks)
    })
}
