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
 * Union of `_reqType` keys whose `.service` is this form.
 * A param slot's service is a `Param`; everything else is a module.
 */
type RequestTrademarksWithForm<
    REQUEST extends Record<PropertyKey, { service: unknown } | undefined>,
    FORM extends "param" | "module"
> = {
    [NAME in keyof REQUEST]-?: NAME extends string ?
        NonNullable<REQUEST[NAME]>["service"] extends Param ?
            FORM extends "param" ?
                NAME
            :   never
        : FORM extends "module" ? NAME
        : never
    :   never
}[keyof REQUEST]

/**
 * Trademarks a plan's services contribute in one form. A dependency's own
 * plan guard already rejected a mix inside its subtree, so one level of
 * `_reqType` is enough to see every form reaching this plan.
 */
type PlanTrademarksWithForm<
    SERVICES extends UnknownService[],
    FORM extends "param" | "module"
> =
    any[] extends SERVICES ? never
    : SERVICES extends (
        [infer S extends UnknownService, ...infer REST extends UnknownService[]]
    ) ?
        | (string extends S["tm"] ? never
          : S extends UnknownModule ?
              | (FORM extends "module" ? S["tm"] : never)
              | (string extends keyof S["_reqType"] ? never
                :   RequestTrademarksWithForm<S["_reqType"], FORM>)
          : FORM extends "param" ? S["tm"]
          : never)
        | PlanTrademarksWithForm<REST, FORM>
    :   never

/** Trademarks this plan declares as a param and as a module at once. */
type PlanMixedTrademark<
    REQUIRED extends UnknownService[],
    OPTIONALS extends OptionalService[] = [],
    SERVICES extends UnknownService[] = [...REQUIRED, ...OPTIONALS]
> = Extract<
    PlanTrademarksWithForm<SERVICES, "param">,
    PlanTrademarksWithForm<SERVICES, "module">
>

export type MixedFormError<TM extends string = string> = {
    ERROR: `Trademark "${TM}" is a param in one dependency and a module in another`
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
    : [PlanMixedTrademark<REQUIRED, OPTIONALS>] extends [never] ?
        PartialModulePlan<TYPE, REQUIRED, OPTIONALS, AWAITED, MAYBE>
    :   MixedFormError<PlanMixedTrademark<REQUIRED, OPTIONALS>>

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
