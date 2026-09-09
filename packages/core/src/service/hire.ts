import { team } from "#service/main"
import type { HiredGuard } from "#types/guards"
import type {
    AfterHireRequest,
    Module,
    OptionalService,
    RequiredHaveAwaited,
    UnknownModule
} from "#types/public"
import type { Supplies } from "#types/records"
import type { MergeStringTuples } from "#types/utils"
import { assertModules } from "#validation"

/**
 * Hires additional modules into the dependency chain of this module.
 * This allows replacing or adding modules composition-root style for testing,
 * mocking, or batching. Hired modules override matching trademarks, or join
 * the graph when the trademark is not on it yet. A module overwrites a param
 * of the same trademark.
 *
 * @param hired - Modules to hire (replace/add to the team)
 * @returns A new module with the hired modules merged into the team
 * @public
 */
export function Hire() {
    return function hire<
        THIS extends Omit<UnknownModule, "_hired"> & {
            _hired: string[]
        },
        HIRED extends UnknownModule[] = []
    >(
        this: THIS,
        ...hired: HiredGuard<THIS, HIRED>
    ): Module<
        THIS["tm"],
        THIS["_type"],
        THIS["_optionalKeys"],
        THIS["_caller"],
        AfterHireRequest<THIS, HIRED>,
        MergeStringTuples<
            THIS["_hired"],
            {
                [K in keyof HIRED]: HIRED[K]["tm"]
            }
        >,
        THIS["_mock"],
        THIS["_awaited"] extends true ? true : RequiredHaveAwaited<HIRED>
    > {
        assertModules(this.tm, hired, true)
        const optionalTms = new Set(
            this._optionals.map((optional) => optional.tm)
        )
        const substitutes = (service: { tm: string }) =>
            hired.some((newService) => newService.tm === service.tm)

        const mergedServices = [
            ...this._required.filter((oldService) => !substitutes(oldService)),
            // An implement for an optional param stays optional, so a `maybe`
            // miss keeps flowing through as `undefined` instead of throwing.
            ...hired.filter((newService) => !optionalTms.has(newService.tm))
        ]

        const mergedOptionals: OptionalService[] = [
            ...this._optionals.filter(
                (oldOptional) => !substitutes(oldOptional)
            ),
            // A definite implement is not a `MaybeModule`, but filling an
            // optional slot that is always filled is sound.
            ...(hired.filter((newService) =>
                optionalTms.has(newService.tm)
            ) as OptionalService[])
        ]

        const mergedHired = [
            ...this._hired.filter(
                (oldTM) => !hired.some((newService) => newService.tm === oldTM)
            ),
            ...hired.map((newService) => newService.tm)
        ] as MergeStringTuples<
            THIS["_hired"],
            {
                [K in keyof HIRED]: HIRED[K]["tm"]
            }
        >

        const _reqType = null as unknown as AfterHireRequest<THIS, HIRED>
        const _suppliesType = null as unknown as Supplies<typeof _reqType>

        const _awaited = (this._awaited ||
            hired.some(
                (module) => module._awaited
            )) as THIS["_awaited"] extends true ? true
        :   RequiredHaveAwaited<HIRED>

        return {
            ...this,
            _required: mergedServices,
            _optionals: mergedOptionals,
            _hired: mergedHired,
            _team: team(this.tm, mergedServices, mergedOptionals),
            _awaited,
            _reqType,
            _suppliesType,
            _caller: {
                ...this._caller,
                market: {
                    ...this._caller?.market,
                    ...hired
                        .map((module) => module._caller?.market ?? {})
                        .reduce((acc, market) => ({ ...acc, ...market }), {})
                }
            },
            _oldReqType: _reqType,
            _oldSuppliesType: _suppliesType,
            _mock: false as const
        } satisfies Module<
            THIS["tm"],
            THIS["_type"],
            THIS["_optionalKeys"],
            THIS["_caller"],
            AfterHireRequest<THIS, HIRED>,
            MergeStringTuples<
                THIS["_hired"],
                {
                    [K in keyof HIRED]: HIRED[K]["tm"]
                }
            >,
            THIS["_mock"],
            THIS["_awaited"] extends true ? true : RequiredHaveAwaited<HIRED>
        >
    }
}
