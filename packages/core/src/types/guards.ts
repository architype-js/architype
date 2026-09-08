import type {
    OptionalService,
    OriginalService,
    Param,
    PartialModulePlan,
    UnknownModule,
    UnknownService
} from "#types/public"
type FindDuplicateTrademark<
    SERVICES extends UnknownService[],
    SEEN extends string[] = []
> =
    any[] extends SERVICES ? never
    : SERVICES extends (
        [
            infer FIRST extends UnknownService,
            ...infer REST extends UnknownService[]
        ]
    ) ?
        string extends FIRST["tm"] ? never
        : FIRST["tm"] extends SEEN[number] ? FIRST["tm"]
        : FindDuplicateTrademark<REST, [...SEEN, FIRST["tm"]]>
    :   never

export interface DuplicateServiceError {
    ERROR: "Duplicate service trademark detected"
}

export type Team<
    REQUIRED extends UnknownService[],
    OPTIONALS extends OptionalService[],
    SERVICES extends UnknownService[] = [...REQUIRED, ...OPTIONALS]
> =
    any[] extends SERVICES ? never
    : SERVICES extends (
        [infer S extends UnknownService, ...infer REST extends UnknownService[]]
    ) ?
        | (string extends S["tm"] ? never
          : S extends UnknownModule ?
              | S["tm"]
              | (string extends keyof S["_reqType"] ? never
                :   keyof S["_reqType"])
          :   S["tm"])
        | Team<REST, []>
    :   never

type TeamHasCircular<
    TM extends string,
    REQUIRED extends UnknownService[],
    OPTIONALS extends OptionalService[]
> =
    string extends TM ? false
    : TM extends Team<REQUIRED, OPTIONALS> ? true
    : false

type PlanHasDuplicate<
    REQUIRED extends OriginalService[],
    OPTIONALS extends OptionalService[]
> =
    [FindDuplicateTrademark<[...REQUIRED, ...OPTIONALS]>] extends [never] ?
        false
    :   true

export type CircularModuleError = {
    ERROR: "Circular dependency detected"
}

/**
 * Valid plan argument for `module()` / `mock()`. Invalid plans become error types.
 * @public
 */
export type ModulePlanGuard<
    TM extends string,
    TYPE,
    REQUIRED extends OriginalService[] = [],
    OPTIONALS extends OptionalService[] = [],
    AWAITED extends boolean | undefined = undefined,
    MAYBE extends boolean | undefined = undefined
> =
    PlanHasDuplicate<REQUIRED, OPTIONALS> extends true ? DuplicateServiceError
    : TeamHasCircular<TM, REQUIRED, OPTIONALS> extends true ?
        CircularModuleError
    :   PartialModulePlan<TYPE, REQUIRED, OPTIONALS, AWAITED, MAYBE>

type FilterHired<
    REQUIRED extends OriginalService[],
    HIRED extends UnknownModule[]
> =
    any[] extends REQUIRED ? []
    : REQUIRED extends (
        [
            infer FIRST extends OriginalService,
            ...infer REST extends OriginalService[]
        ]
    ) ?
        FIRST["tm"] extends HIRED[number]["tm"] ?
            FilterHired<REST, HIRED>
        :   [FIRST, ...FilterHired<REST, HIRED>]
    :   []

type MergeHired<THIS extends UnknownModule, HIRED extends UnknownModule[]> = [
    ...FilterHired<THIS["_required"], HIRED>,
    ...HIRED
]

/**
 * Valid hired modules for `hire()`. Invalid tuples become error types.
 * @public
 */
export type HiredGuard<
    THIS extends UnknownModule,
    HIRED extends UnknownModule[]
> =
    [FindDuplicateTrademark<HIRED>] extends [never] ?
        TeamHasCircular<THIS["tm"], MergeHired<THIS, HIRED>, Param[]> extends (
            true
        ) ?
            CircularModuleError[]
        :   HIRED
    :   DuplicateServiceError[]
