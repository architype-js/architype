import type { HiredGuard, ModulePlanGuard } from "#types/guards"
import type { Factory, Service, Warmup } from "#types/internal"
import type {
    Market,
    Supplies,
    Request,
    MarketPlan,
    MarketRecord,
    RegistryRecord
} from "#types/records"
import type { MergeStringTuples } from "#types/utils"
import type { Merge, UnionToIntersection } from "#utils"

export interface Param<
    NAME extends string = string,
    TYPE = unknown,
    INIT = unknown
> extends Service<NAME, TYPE> {
    /**
     * Sets an initial (default) value for the param, used when it is not
     * requested. Returns the same param with `_init` set, which makes its
     * field optional in the REQUEST type.
     */
    init: <THIS extends Param>(
        this: THIS,
        value: THIS["_type"]
    ) => Param<THIS["tm"], THIS["_type"], THIS["_type"]>
    /**
     * Creates a module that fills this param (same trademark). Hire it at the
     * request entry-point so dependents that `required` the param receive this
     * implementation.
     *
     * Pass `awaited: true` when the factory returns `Promise<T>` but the param
     * (and module `_type`) stay `T`. Pass `maybe: true` when the factory
     * returns `T | undefined` but `_type` stays `T`. The runner throws only
     * if a dependent that `required` this trademark would receive a miss.
     */
    module: <
        THIS extends Param<NAME, TYPE, INIT>,
        const AWAITED extends boolean | undefined = undefined,
        const MAYBE extends boolean | undefined = undefined,
        REQUIRED2 extends OriginalService[] = [],
        OPTIONALS2 extends OptionalService[] = []
    >(
        this: THIS,
        plan: ModulePlanGuard<
            THIS["tm"],
            | THIS["_type"]
            | (MAYBE extends true ? undefined : never)
            | (AWAITED extends true ?
                  Promise<
                      THIS["_type"] | (MAYBE extends true ? undefined : never)
                  >
              :   never),
            REQUIRED2,
            OPTIONALS2,
            AWAITED,
            MAYBE
        >
    ) => Module<
        THIS["tm"],
        THIS["_type"],
        OPTIONALS2[number]["tm"],
        undefined,
        Request<{
            required: REQUIRED2
            optionals: OPTIONALS2
        }>,
        [],
        false,
        EffectiveAwaited<AWAITED, [...REQUIRED2, ...OPTIONALS2]>
    > & { _maybe: MAYBE extends true ? true : false }
    _type: TYPE
    _param: true
    _mock: false
    /**
     * The initial (default) value, used when the param is not requested.
     * `never` when the param was created without an initial value, which keeps
     * its field required in the REQUEST type.
     */
    _init: INIT
    /** True after `.init(...)` — missing required params without this throw at request. */
    _inited: boolean
}

/**
 * Plan for `module()` / `mock()`.
 * When chaining on a sync param, pass `awaited: true` so an async factory keeps
 * `_type` as the param’s `T` (not `Promise<T>`) — dependents receive the awaited value.
 * Pass `maybe: true` so a factory that returns `T | undefined` keeps `_type` as `T`.
 */
export type PartialModulePlan<
    TYPE,
    REQUIRED extends OriginalService[] = [],
    OPTIONALS extends OptionalService[] = [],
    AWAITED extends boolean | undefined = undefined,
    MAYBE extends boolean | undefined = undefined
> = {
    required?: [...REQUIRED]
    optionals?: [...OPTIONALS]
    factory: Factory<TYPE, REQUIRED, OPTIONALS>
    warmup?: Warmup<TYPE, REQUIRED, OPTIONALS>
} & (AWAITED extends true ? { awaited: true }
: AWAITED extends false ? { awaited?: false }
: { awaited?: AWAITED }) &
    (MAYBE extends true ? { maybe: true }
    : MAYBE extends false ? { maybe?: false }
    : { maybe?: MAYBE })

/** True when any module in the list is `_awaited: true` (params are skipped). */
export type RequiredHaveAwaited<REQUIRED extends readonly unknown[]> =
    REQUIRED extends [infer FIRST, ...infer REST extends unknown[]] ?
        FIRST extends { _awaited: infer A } ?
            A extends true ?
                true
            :   RequiredHaveAwaited<REST>
        :   RequiredHaveAwaited<REST>
    :   false

export type EffectiveAwaited<
    PLAN_AWAITED extends boolean | undefined,
    REQUIRED extends readonly unknown[]
> = PLAN_AWAITED extends true ? true : RequiredHaveAwaited<REQUIRED>

type OptionalRequestKeys<REQ> = {
    [K in keyof REQ]-?: undefined extends REQ[K] ? K : never
}[keyof REQ]

/** `keyof` a union yields only shared keys; this keeps the keys of every member. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

/**
 * Every hired module's own request shape, intersected. `HIRED[number]` is a
 * union, so intersecting is what makes `hire(a, b)` demand the open params
 * of both — a union would let `.request()` satisfy just one member.
 * Hired trademarks drop out: one hire fills them even when a sibling still
 * lists them transitively.
 */
type HiredRequest<HIRED extends UnknownModule[]> =
    Omit<
        UnionToIntersection<HIRED[number]["_reqType"]>,
        HIRED[number]["tm"]
    > extends infer REQ extends Partial<MarketRecord<UnknownService>> ?
        REQ
    :   {}

/**
 * Request shape after `hire()`. Parent-optional keys (including `ctx` omissions)
 * stay optional; hired trademarks drop; remaining hired deps merge in.
 */
export type AfterHireRequest<
    THIS extends { _reqType: object; _oldReqType?: object },
    HIRED extends UnknownModule[]
> = Merge<
    {
        [SERVICE in HIRED[number] as SERVICE["tm"]]?: Supplier<SERVICE>
    },
    Merge<
        HiredRequest<HIRED>,
        Omit<
            THIS["_reqType"],
            | HIRED[number]["tm"]
            | Exclude<
                  KeysOfUnion<HIRED[number]["_oldReqType"]>,
                  OptionalRequestKeys<THIS["_reqType"]>
              >
        >
    >
>

export interface Module<
    NAME extends string,
    TYPE,
    OPTIONAL_KEYS extends string,
    CALLER extends Pick<ModuleSupplier<UnknownModule>, "market"> | undefined,
    REQUEST extends Partial<MarketRecord<UnknownService>>,
    HIRED extends string[],
    MOCK extends boolean = boolean,
    AWAITED extends boolean = false
> extends Service<NAME, TYPE> {
    /** Calls the module by providing the specified dependencies */
    request: <THIS extends UnknownModule>(
        this: THIS,
        req: THIS["_reqType"]
    ) => Supplier<THIS>
    provision: <THIS extends UnknownModule>(this: THIS) => THIS
    invalidate: <THIS extends UnknownModule>(this: THIS) => void
    caching: <THIS extends UnknownModule>(
        this: THIS,
        config: CachingConfig<THIS["_type"]>
    ) => THIS
    mock: <
        THIS extends UnknownModule & {
            tm: NAME
            _type: TYPE
            _mock: false
        },
        TYPE2 extends THIS["_type"],
        REQUIRED2 extends OriginalService[] = [],
        OPTIONALS2 extends OptionalService[] = []
    >(
        this: THIS,
        plan: ModulePlanGuard<THIS["tm"], TYPE2, REQUIRED2, OPTIONALS2>
    ) => Mock<THIS, TYPE2, REQUIRED2, OPTIONALS2>
    hire: <THIS extends UnknownModule, HIRED extends UnknownModule[] = []>(
        this: THIS,
        ...hired: HiredGuard<THIS, HIRED>
    ) => Module<
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
    _module: true
    _param: false
    _type: TYPE
    /**
     * When true, `.get()` returns `Promise<_type>`: either `awaited: true` on the
     * plan (value is awaited before dependents see it), or a required/hired
     * dependency that is itself `_awaited`.
     */
    _awaited: AWAITED
    _optionalKeys: OPTIONAL_KEYS
    _caller: CALLER
    _reqType: REQUEST
    _suppliesType: Supplies<REQUEST>
    _oldReqType: REQUEST
    _oldSuppliesType: Supplies<REQUEST>
    /** Array of services this service depends on */
    _required: OriginalService[]
    /** Array of optional request services this service may depend on */
    _optionals: OptionalService[]
    _team: UnknownService[]
    _hired: HIRED
    /** Factory function that creates the service's value from its dependencies */
    _factory: (deps: any, ctx: any) => TYPE | Promise<TYPE>
    /** Optional initialization function called after factory */
    _warmup?: (value: any, deps: any) => void
    _caching?: CachingConfig<TYPE>
    _version: number
    _implementId: string
    _resolve: <THIS extends UnknownModule>(
        this: THIS,
        lazyMarket: RegistryRecord
    ) => Supplier<THIS>
    _mock: MOCK
    /**
     * True when `maybe: true` on the plan: factory may return `_type | undefined`
     * while `_type` stays `T`. The runner throws only if the factory reading
     * this trademark listed it under `required` (not `optionals`).
     */
    _maybe: boolean
}

export type UnknownService = UnknownModule | Param
export type OriginalService = UnknownService & {
    _mock: false
}

/** A `maybe: true` module. Allowed in `optionals` alongside params. */
export type MaybeModule = UnknownModule & { _maybe: true }
export type OptionalService = Param | MaybeModule

export type UnknownModule = Module<
    string,
    unknown,
    string,
    ModuleSupplier<UnknownModule> | undefined,
    Partial<MarketRecord<any>>,
    string[],
    boolean,
    boolean
>

export type Mock<
    MODULE extends UnknownModule,
    TYPE2 extends MODULE["_type"],
    REQUIRED2 extends OriginalService[] = [],
    OPTIONALS2 extends OptionalService[] = []
> = Omit<
    Module<
        MODULE["tm"],
        TYPE2,
        OPTIONALS2[number]["tm"],
        undefined,
        Request<{
            required: REQUIRED2
            optionals: OPTIONALS2
        }>,
        [],
        true
    >,
    "_mock" | "_oldReqType" | "_oldSuppliesType"
> & {
    _mock: true
    _implementId: string
    _oldReqType: MODULE["_reqType"]
    _oldSuppliesType: MODULE["_suppliesType"]
}

export type ModuleSupplier<MODULE extends UnknownModule> = {
    service: MODULE
    /**
     * When `_awaited`, one Promise around the resolved value — never
     * `Promise<Promise<…>>` even if `_type` was inferred as `Promise<T>`
     * from an async factory (the runner already awaits it).
     */
    get: () => MODULE["_awaited"] extends true ?
        Promise<Awaited<MODULE["_type"]>>
    :   MODULE["_type"]
    /**
     * Sync teams: unwrapped dep values (`.get()` of each supply).
     * Awaited teams: `Promise` of that same bag after awaiting `_awaited` deps
     * (matches what the factory receives — sync-typed leaves need no await).
     */
    supplies: MODULE["_awaited"] extends true ? Promise<MODULE["_suppliesType"]>
    :   MODULE["_suppliesType"]
    market: Market<MODULE>
    _requested: boolean
}

export type ParamSupplier<PARAM extends Param> = {
    service: PARAM
    get: () => PARAM["_type"]
    _requested: true
}

export type Supplier<SERVICE extends UnknownService> =
    SERVICE extends Param ? ParamSupplier<SERVICE>
    :   ModuleSupplier<Extract<SERVICE, UnknownModule>>

/**
 * ctx transforms modules into contextualized modules that can be called again with new specs.
 * This enables dynamic dependency injection within a module's factory.
 * @typeParam MODULE - The current module providing context
 * @returns A function that takes a module and returns it with a contextualized call method
 * @public
 */
export type Ctx<
    CALLER extends Pick<UnknownModule, "_optionals" | "_required">
> = <SERVICE extends UnknownService>(
    service: SERVICE
) => SERVICE extends UnknownModule ?
    Merge<
        SERVICE,
        {
            _caller: Merge<
                ModuleSupplier<UnknownModule>,
                {
                    market: MarketPlan<{
                        required: CALLER["_required"]
                        optionals: CALLER["_optionals"]
                    }>
                }
            >
            _reqType: Omit<
                SERVICE["_reqType"],
                keyof Request<{
                    required: CALLER["_required"]
                    optionals: CALLER["_optionals"]
                }>
            > &
                Partial<
                    Request<{
                        required: CALLER["_required"]
                        optionals: CALLER["_optionals"]
                    }>
                >
        }
    >
:   SERVICE

export type Cacher = <TYPE>(
    factoryRunner: () => TYPE,
    cacheKey: string
) => () => TYPE

export type ResourceCacher = <TYPE extends Promise<unknown>>(
    factoryRunner: () => TYPE,
    cacheKey: string
) => () => TYPE

export type Serializer = (value: unknown) => string

export type CachingConfig<TYPE> = {
    cacher: [TYPE] extends [Promise<unknown>] ? ResourceCacher : Cacher
    serializer: Serializer
}

export type { MarketRecord, RegistryRecord, Request }
export type {
    CircularModuleError,
    DuplicateServiceError,
    HiredGuard as HireArg,
    ModulePlanGuard,
    Team
} from "#types/guards"
