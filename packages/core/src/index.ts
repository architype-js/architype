import { Hire } from "#service/hire"
import { moduleBase, shared } from "#service/main"
import { Mock } from "#service/mock"
import type { ModulePlanGuard } from "#types/guards"
import type {
    EffectiveAwaited,
    Module,
    OptionalService,
    OriginalService,
    Param,
    PartialModulePlan
} from "#types/public"
import type { Request } from "#types/records"

export function service<TM extends string>(tm: TM) {
    function module<
        TYPE,
        REQUIRED extends OriginalService[] = [],
        OPTIONALS extends OptionalService[] = [],
        AWAITED extends boolean | undefined = undefined,
        MAYBE extends boolean | undefined = undefined
    >(
        plan: ModulePlanGuard<TM, TYPE, REQUIRED, OPTIONALS, AWAITED, MAYBE>
    ): Module<
        TM,
        Exclude<
            AWAITED extends true ? Awaited<TYPE> : TYPE,
            MAYBE extends true ? undefined : never
        >,
        OPTIONALS[number]["tm"],
        undefined,
        Request<{
            required: REQUIRED
            optionals: OPTIONALS
        }>,
        [],
        false,
        EffectiveAwaited<AWAITED, [...REQUIRED, ...OPTIONALS]>
    > & { _maybe: MAYBE extends true ? true : false } {
        return {
            ...moduleBase(
                tm,
                plan as PartialModulePlan<TYPE, REQUIRED, OPTIONALS>
            ),
            mock: Mock(),
            hire: Hire(),
            _mock: false as const
        } as any
    }

    return {
        param<TYPE = any>(): Param<TM, TYPE, never> {
            return {
                ...shared<TM, TYPE>(tm),
                module,
                _param: true as const
            } as unknown as Param<TM, TYPE, never>
        },
        /**
         * Creates a module that can assemble complex objects from dependencies.
         * Modules can depend on other specs and services and have factory functions for creation.
         *
         * @typeParam TYPE - The type constraint for values this module produces
         * @typeParam REQUIRED - Array of services this module depends on
         * @typeParam OPTIONALS - Array of optional request parameters this module may depend on
         * @param plan - Plan for the module
         * @param plan.factory - Factory function that creates the value from its dependencies
         * @param plan.warmup - Optional function called after the factory returns (see README for eager / lazy / warmed patterns)
         * @param plan.awaited - When true, factory may return `Promise<T>` while `_type` stays `T`
         * @param plan.maybe - When true, factory may return `T | undefined` while `_type` stays `T`. The runner throws only if a factory that `required` this trademark would receive a miss.
         *
         * @returns A module with methods like call, provision, mock, and hire
         * @public
         */
        module
    }
}

export { index, sleep, once } from "#utils"
export * from "#types/public"
