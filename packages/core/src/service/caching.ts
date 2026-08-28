import type {
    CachingConfig,
    RegistryRecord,
    UnknownModule
} from "#types/public"
import { wasRequested } from "#utils"
import { assertCachingConfig } from "#validation"

/**
 * Enables cross-request caching for a module after its TYPE has been inferred.
 *
 * @param config - Cacher and serializer for cache keys
 * @returns The same module with caching enabled
 * @public
 */
export function caching<THIS extends UnknownModule>(
    this: THIS,
    config: CachingConfig<THIS["_type"]>
): THIS {
    assertCachingConfig(this.tm, config)
    return { ...this, _caching: config }
}

export function buildCacheKey(
    module: UnknownModule & { _caching: CachingConfig<unknown> },
    registry: RegistryRecord
) {
    const moduleId = (service: {
        tm: string
        _implementId?: string
        _version?: number
    }) => {
        return [service.tm, service._implementId, service._version]
            .filter((part) => part !== undefined)
            .join(".")
    }

    const parts = module._team
        .map((member) => {
            const registration = registry[member.tm]
            if (!registration) return undefined

            const supplier =
                typeof registration === "function" ?
                    registration()
                :   registration

            // Stamped / requested values (`.of(...)`, including init defaults)
            // enter the key via the serializer. Factory-resolved modules
            // contribute identity only — their inputs are already keyed.
            if (wasRequested(supplier)) {
                return `${member.tm}:${module._caching.serializer(supplier.get())}`
            }

            return moduleId(supplier.service)
        })
        .filter((part) => part !== undefined)

    return [moduleId(module), ...parts].join("_")
}
