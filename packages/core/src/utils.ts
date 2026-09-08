import type {
    ModuleSupplier,
    UnknownService,
    Supplier,
    UnknownModule
} from "#types/public"

/**
 * Minimal once implementation for memoizing thunk results.
 * Caches successful results only; if the wrapped function throws, the next
 * call runs it again.
 *
 * @typeParam T - The function type to wrap
 * @param func - The function to execute only once
 * @returns A memoized version of the function that caches successful results
 * @internal
 */
export function once<F extends () => any>(fn: F): F {
    let called = false
    let result: ReturnType<F>

    return function () {
        if (!called) {
            result = fn()
            called = true
        }
        return result
    } as F
}

export function dedupe(services: UnknownService[], owner?: string) {
    const deduped: Record<string, UnknownService> = {}
    for (const service of services) {
        const existing = deduped[service.tm]
        // One trademark, one form. A module filling a param slot leaves every
        // param-declaring dependent with a frozen `_awaited` gate, so an awaited
        // implement reaches a sync factory as an un-awaited Promise.
        if (existing && isModule(existing) !== isModule(service)) {
            throw new Error(
                `${owner ? `${owner}: ` : ""}trademark "${service.tm}" is a param in one dependency and a module in another. Fill a param with a stamped value (.of()); fill a module by declaring it.`
            )
        }
        deduped[service.tm] = service
    }
    return Object.values(deduped)
}

export function simpleId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * Transforms an array of suppliers into a map keyed by service trademarks.
 * This provides type-safe access to suppliers by their service trademarks.
 * `undefined` entries are ignored and omitted from the result type.
 *
 * @typeParam LIST - An array type where each element has a `service` property with a `tm`, or is `undefined`
 * @param list - Array of suppliers to index (`undefined` entries are filtered out)
 * @returns A map where keys are service trademarks and values are their suppliers
 * @public
 */
export function index<
    LIST extends ({ service: { tm: string } } | undefined)[]
>(...list: LIST) {
    return list.reduce(
        (acc, r) => (r == null ? acc : { ...acc, [r.service.tm]: r }),
        {}
    ) as MapFromList<LIST>
}

/**
 * Converts an array of objects with name properties into a map where keys are the names.
 * This is used internally to create lookup maps from service arrays for type-safe access.
 * `undefined` entries in the list are excluded from the resulting map type.
 *
 * @typeParam LIST - An array of objects that have a `service.tm` property, or `undefined`
 * @returns A map type where each key is a trademark from the list and values are the corresponding objects
 * @public
 */
type IndexEntry<ITEM> =
    [ITEM] extends [undefined] ? {}
    : ITEM extends { service: { tm: infer TM extends string } } ?
        undefined extends ITEM ? { [NAME in TM]?: Exclude<ITEM, undefined> }
        :   { [NAME in TM]: ITEM }
    :   {}

type MapFromListTuple<
    LIST extends ({ service: { tm: string } } | undefined)[]
> =
    LIST extends (
        readonly [
            infer HEAD,
            ...infer TAIL extends ({ service: { tm: string } } | undefined)[]
        ]
    ) ?
        Merge<IndexEntry<HEAD>, MapFromListTuple<TAIL>>
    :   {}

export type MapFromList<
    LIST extends ({ service: { tm: string } } | undefined)[]
> =
    [Exclude<LIST[number], undefined>] extends [never] ?
        Record<string, never>
    :   MapFromListTuple<LIST>

/**
 * @param ms - Number of milliseconds to wait
 * @returns A promise that resolves after the delay with undefined
 * @internal
 */
export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Type guard to check if a service is a module.
 * @param service - The service to check
 * @returns True if the service is an app service, false if it's a request service
 * @internal
 */
export function isModule<MODULE extends UnknownModule>(
    service: MODULE | Pick<UnknownService, "tm">
): service is MODULE {
    return "_module" in service && service._module === true
}

export function isParam<PARAM extends { _param: true }>(
    service: PARAM | Pick<UnknownService, "tm">
): service is PARAM {
    return "_param" in service && service._param === true
}

export function isModuleSupplier<SUPPLIER extends Supplier<UnknownService>>(
    supplier: SUPPLIER
): supplier is Extract<SUPPLIER, ModuleSupplier<UnknownModule>> {
    return isModule(supplier.service)
}

export function wasRequested(supplier: Supplier<UnknownService>) {
    return "_requested" in supplier && supplier._requested === true
}

/**
 * Merges a union type into a single intersection type.
 * This utility type is used internally to combine multiple types into one cohesive type.
 * @typeParam U - The union type to merge
 * @returns An intersection type that combines all members of the union
 * @public
 */

export type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I
    :   never

export type Merge<T, U> = [U] extends [never] ? T : Omit<T, keyof U> & U
