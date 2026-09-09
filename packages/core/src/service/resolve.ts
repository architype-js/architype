import { buildCacheKey } from "#service/caching"
import type {
    Ctx,
    UnknownService,
    Supplier,
    UnknownModule,
    ModuleSupplier
} from "#types/public"
import type { MarketPlan, RegistryRecord, SuppliesPlan } from "#types/records"
import { isModule, once, type Merge } from "#utils"

export function CtxFactory<
    SUPPLIER extends Merge<
        ModuleSupplier<UnknownModule>,
        {
            market: MarketPlan<{
                required: Pick<MODULE, "_required">["_required"]
                optionals: Pick<MODULE, "_optionals">["_optionals"]
            }>
        }
    >,
    MODULE extends Pick<UnknownModule, "_required" | "_optionals">
>(callerSupplier: SUPPLIER, callerModule: MODULE): Ctx<MODULE> {
    const fromCaller = (service: Pick<UnknownService, "tm">) =>
        callerModule._required.find((member) => member.tm === service.tm) ??
        service

    return ((
        service: Pick<UnknownService, "tm">,
        ...hired: UnknownModule[]
    ) => {
        const actual = fromCaller(service)

        if (!isModule(actual)) {
            if (hired.length > 0) {
                throw new Error(
                    `ctx: extra modules require a module root, got param "${service.tm}"`
                )
            }
            return actual
        }

        const root = {
            ...actual,
            _caller: callerSupplier
        }

        if (hired.length === 0) return root

        return root.hire(
            ...(hired.map((module) => {
                const found = fromCaller(module)
                return isModule(found) ? found : module
            }) as never)
        )
    }) as unknown as Ctx<MODULE>
}

type SyncSupplies<THIS extends UnknownModule> = SuppliesPlan<{
    required: THIS["_required"]
    optionals: THIS["_optionals"]
}>

type MarketMap = Record<string, Supplier<UnknownService> | undefined>

function isAwaitedSupplier(
    producer: { service: UnknownService; market?: unknown } | undefined
): boolean {
    return (
        producer != null &&
        isModule(producer.service) &&
        teamAwaited(producer.service, (producer.market ?? {}) as MarketMap)
    )
}

function teamAwaited(
    service: Pick<UnknownModule, "_awaited" | "_team">,
    market: MarketMap
): boolean {
    return (
        service._awaited ||
        service._team.some((member) => isAwaitedSupplier(market[member.tm]))
    )
}

/** Miss: no supplier, or a maybe module whose value is `undefined`. */
function isRequiredMiss(
    isRequiredTm: (name: string) => boolean,
    name: string,
    supplier: unknown,
    value: unknown
): boolean {
    if (!isRequiredTm(name) || value !== undefined) return false
    if (supplier == null) return true
    const service = (supplier as { service?: { _maybe?: boolean } }).service
    return service?._maybe === true
}

/**
 * Internal resolve method that creates the actual supplier.
 *
 * @param this - The module building the supplier
 * @param registry - The supplier map providing resolved dependencies
 * @returns A supplier instance with get(), supplies, market, service, _ctx, and _requested methods
 * @internal
 */
export function _resolve<THIS extends UnknownModule>(
    this: THIS,
    registry: RegistryRecord
): Supplier<THIS> {
    const requiredTms = new Set(this._required.map((service) => service.tm))
    const optionalTms = new Set(this._optionals.map((service) => service.tm))
    const isRequiredTm = (name: string) =>
        requiredTms.has(name) && !optionalTms.has(name)

    const { supplies, market } = Object.entries(registry).reduce(
        (acc, [name, registration]) => {
            if (!this._team.some((service) => service.tm === name)) return acc

            const loadSupplier = once(() => {
                if (typeof registration === "function") {
                    return registration()
                }
                return registration
            })
            Object.defineProperty(acc.market, name, {
                get() {
                    return loadSupplier()
                },
                enumerable: true,
                configurable: true
            })

            Object.defineProperty(acc.supplies, name, {
                get() {
                    const supplier = loadSupplier()
                    const value = supplier?.get()
                    if (isRequiredMiss(isRequiredTm, name, supplier, value)) {
                        throw new Error(`Dependency ${name} is not available`)
                    }
                    return value
                },
                enumerable: true,
                configurable: true
            })
            return acc
        },
        {
            supplies: {} as SyncSupplies<THIS>,
            market: {} as MarketPlan<{
                required: THIS["_required"]
                optionals: THIS["_optionals"]
            }>
        }
    )

    const assertRequired = () => {
        this._required.forEach((service) => {
            if (!(service.tm in supplies)) {
                // This error will be catched in warmup phase, but will trigger if get() is called again afterwards.
                throw new Error(`Dependency ${service.tm} is not available`)
            }
        })
    }

    // One real Promise of the unwrapped bag (shared with the async factory).
    const awaitedSupplies = once(async (): Promise<SyncSupplies<THIS>> => {
        assertRequired()
        const resolved = {} as SyncSupplies<THIS>
        for (const name of Object.keys(market)) {
            const supplier = (
                market as Record<string, Supplier<UnknownService>>
            )[name]!
            const supply = (supplies as Record<string, unknown>)[name]
            ;(resolved as Record<string, unknown>)[name] =
                isAwaitedSupplier(supplier) ? await supply : supply
            if (
                isRequiredMiss(
                    isRequiredTm,
                    name,
                    supplier,
                    (resolved as Record<string, unknown>)[name]
                )
            ) {
                throw new Error(`Dependency ${name} is not available`)
            }
        }
        return resolved
    })

    const syncFactoryRunner = () => {
        assertRequired()
        const value = this._factory(supplies, CtxFactory(supplier, this))
        if (this._warmup) {
            this._warmup(value, supplies)
        }
        return value
    }

    const asyncFactoryRunner = async () => {
        const awaited = await awaitedSupplies()
        const value = await this._factory(awaited, CtxFactory(supplier, this))
        if (this._warmup) {
            this._warmup(value, awaited)
        }
        return value
    }

    const _caching = this._caching
    const awaited = isAwaitedSupplier({ service: this, market })
    const runner = awaited ? asyncFactoryRunner : syncFactoryRunner
    const get = once(
        _caching ?
            _caching.cacher(
                runner,
                buildCacheKey({ ...this, _caching }, registry)
            )
        :   runner
    )

    const supplier = {
        tm: this.tm,
        get,
        market,
        get supplies() {
            return awaited ? awaitedSupplies() : supplies
        },
        service: this,
        _ctx<SERVICE extends UnknownService>(service: SERVICE) {
            return CtxFactory(supplier, this.service)(service)
        },
        _requested: false as const
    }

    return supplier as any
}
