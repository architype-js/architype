import type {
    ModuleSupplier,
    UnknownService,
    Supplier,
    UnknownModule
} from "#types/public"
import type { MarketRecord, RegistryRecord } from "#types/records"
import {
    wasRequested,
    isModule,
    isModuleSupplier,
    isParam,
    once
} from "#utils"
import { assertPlainObject } from "#validation"

export function request<THIS extends UnknownModule>(
    this: THIS,
    req: THIS["_reqType"]
) {
    assertPlainObject("request", req)

    // Stores the known suppliers that can be preserved to optimize nested requests
    const preserved: MarketRecord<UnknownService> = {}

    for (const [name, supplier] of Object.entries(this._caller?.market ?? {})) {
        // Do not preserve supplies from newly hired
        // or newly specified
        if (this._hired.some((hname) => hname === name) || name in req) {
            continue
        }

        // Do not preserve if some of the services's team members
        // depend on newly hired or specified (except service not from factory
        // which are preserved if not directly overwritten by specified)
        if (
            supplier &&
            isModuleSupplier(supplier) &&
            !wasRequested(supplier) &&
            supplier.service._team.some(
                (s: UnknownService) =>
                    s.tm in req || this._hired.some((hname) => hname === s.tm)
            )
        ) {
            continue
        }

        preserved[name] = supplier
    }

    const definedRequested: MarketRecord<UnknownService> = Object.fromEntries(
        Object.entries(req).filter(
            (entry): entry is [string, Supplier<UnknownService>] =>
                entry[1] !== undefined
        )
    )

    const registry: RegistryRecord = {
        ...preserved,
        ...definedRequested
    }

    for (const service of this._team) {
        if (service.tm in registry) continue
        if (isModule(service)) {
            registry[service.tm] = once(() => service._resolve(registry))
            continue
        }
        if (isParam(service)) {
            registry[service.tm] = service.of(service._init)
        }
    }

    const supplier = this._resolve(registry)
    warmup(supplier)

    return supplier
}

function warmup(supplier: ModuleSupplier<UnknownModule>) {
    // Warmup service factories in the background (non-blocking)
    for (const member of supplier.service._team) {
        // If warmup fails, we don't want to break the entire supply chain
        // The error will be thrown again when the dependency is actually needed
        Promise.resolve(supplier.supplies)
            .then((bag) => (bag as Record<string, unknown>)[member.tm])
            .catch(() => {
                // Silently catch errors during warmup
                // The error will be thrown again when the dependency is actually accessed
            })
    }

    Promise.resolve()
        .then(() => supplier.get())
        .catch(() => {
            // Silently catch errors during warmup
            // The error will be thrown again when the dependency is actually accessed
        })
}

export function provision<THIS extends UnknownModule>(this: THIS) {
    const supplier = request.call(this, {})
    return {
        ...this,
        _caller: {
            ...supplier,
            market: { ...supplier.market, [this.tm]: supplier }
        }
    }
}
