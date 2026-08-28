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
    return <SERVICE extends Pick<UnknownService, "tm">>(
        service: SERVICE
    ): any => {
        const actual =
            callerModule._required.find((member) => member.tm === service.tm) ??
            service

        if (!isModule(actual)) {
            return actual
        }

        return {
            ...actual,
            _caller: callerSupplier
        }
    }
}

type SyncSupplies<THIS extends UnknownModule> = SuppliesPlan<{
    required: THIS["_required"]
    optionals: THIS["_optionals"]
}>

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
                    return loadSupplier()?.get()
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
            const sub = (market as Record<string, Supplier<UnknownService>>)[
                name
            ]!
            const raw = (supplies as Record<string, unknown>)[name]
            ;(resolved as Record<string, unknown>)[name] =
                isModule(sub.service) && sub.service._awaited ? await raw : raw
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
    const teamAwaited =
        this._awaited ||
        this._team.some((member) => isModule(member) && member._awaited)
    const runner = teamAwaited ? asyncFactoryRunner : syncFactoryRunner
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
            return teamAwaited ? awaitedSupplies() : supplies
        },
        service: this,
        _ctx<SERVICE extends UnknownService>(service: SERVICE) {
            return CtxFactory(supplier, this.service)(service)
        },
        _requested: false as const
    }

    return supplier as any
}
