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
    _type: TYPE
    _param: true
    _mock: false
    /**
     * The initial (default) value, used when the param is not requested.
     * `never` when the param was created without an initial value, which keeps
     * its field required in the REQUEST type.
     */
    _init: INIT
}

/**
 * An interface: trademark + value type, no factory. Fill it with `.of(value)`
 * or `.implement(...)` then `hire` the implement at the entry-point.
 */
export interface Interface<NAME extends string = string, TYPE = unknown>
    extends Service<NAME, TYPE> {
    implement: <
        THIS extends Interface<NAME, TYPE>,
        TYPE2 extends THIS["_type"],
        REQUIRED2 extends OriginalService[] = [],
        OPTIONALS2 extends Param[] = []
    >(
        this: THIS,
        plan: ModulePlanGuard<THIS["tm"], TYPE2, REQUIRED2, OPTIONALS2>
    ) => Implement<THIS, TYPE2, REQUIRED2, OPTIONALS2>
    _interface: true
    _param: false
    _module: false
    _mock: false
}

export type PartialModulePlan<
    TYPE,
    REQUIRED extends OriginalService[] = [],
    OPTIONALS extends Param[] = []
> = {
    required?: [...REQUIRED]
    optionals?: [...OPTIONALS]
    factory: Factory<TYPE, REQUIRED, OPTIONALS>
    warmup?: Warmup<TYPE, REQUIRED, OPTIONALS>
}

type OptionalRequestKeys<REQ> = {
    [K in keyof REQ]-?: undefined extends REQ[K] ? K : never
}[keyof REQ]

/** `keyof` a union yields only shared keys; this keeps the keys of every member. */
type KeysOfUnion<T> = T extends unknown ? keyof T : never

/**
 * Every hired module's own request shape, intersected. `HIRED[number]` is a
 * union, so intersecting is what makes `hire(a, b)` demand the open params and
 * interfaces of both — a union would let `.request()` satisfy just one member.
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
    MOCK extends boolean = boolean
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
        OPTIONALS2 extends Param[] = []
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
        THIS["_mock"]
    >
    _module: true
    _param: false
    _interface: false
    _type: TYPE
    _optionalKeys: OPTIONAL_KEYS
    _caller: CALLER
    _reqType: REQUEST
    _suppliesType: Supplies<REQUEST>
    _oldReqType: REQUEST
    _oldSuppliesType: Supplies<REQUEST>
    /** Array of services this service depends on */
    _required: OriginalService[]
    /** Array of optional request services this service may depend on */
    _optionals: Param[]
    _team: UnknownService[]
    _hired: HIRED
    /** Factory function that creates the service's value from its dependencies */
    _factory: (deps: any, ctx: any) => TYPE
    /** Optional initialization function called after factory */
    _warmup?: (value: any, deps: any) => void
    _caching?: CachingConfig<TYPE>
    _version: number
    _implement?: boolean
    _implementId?: string
    _resolve: <THIS extends UnknownModule>(
        this: THIS,
        lazyMarket: RegistryRecord
    ) => Supplier<THIS>
    _mock: MOCK
}

export type UnknownService = UnknownModule | Param | Interface
export type OriginalService = UnknownService & {
    _mock: false
}

export type UnknownModule = Module<
    string,
    unknown,
    string,
    ModuleSupplier<UnknownModule> | undefined,
    Partial<MarketRecord<any>>,
    string[],
    boolean
>

export type Mock<
    MODULE extends UnknownModule,
    TYPE2 extends MODULE["_type"],
    REQUIRED2 extends OriginalService[] = [],
    OPTIONALS2 extends Param[] = []
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

export type Implement<
    INTERFACE extends Interface,
    TYPE2 extends INTERFACE["_type"],
    REQUIRED2 extends OriginalService[] = [],
    OPTIONALS2 extends Param[] = []
> = Module<
    INTERFACE["tm"],
    TYPE2,
    OPTIONALS2[number]["tm"],
    undefined,
    Request<{
        required: REQUIRED2
        optionals: OPTIONALS2
    }>,
    [],
    false
> & {
    _implement: true
    _implementId: string
}

/**
 * Represents a supplier - The result of resolving a module
 * with all its dependencies, which can easily be passed
 * to other modules.
 *
 * @typeParam NAME - The unique identifier name for this supplier
 * @typeParam VALUE - The type of value this supplier holds
 * @public
 */
export type ModuleSupplier<MODULE extends UnknownModule> = {
    service: MODULE
    get: () => MODULE["_type"]
    supplies: MODULE["_suppliesType"]
    market: Market<MODULE>
    _requested: boolean
}

export type ParamSupplier<PARAM extends Param> = {
    service: PARAM
    get: () => PARAM["_type"]
    _requested: true
}

export type InterfaceSupplier<INTERFACE extends Interface> = {
    service: INTERFACE
    get: () => INTERFACE["_type"]
    _requested: true
}

export type Supplier<SERVICE extends UnknownService> =
    SERVICE extends Param ? ParamSupplier<SERVICE>
    : SERVICE extends Interface ? InterfaceSupplier<SERVICE>
    : ModuleSupplier<Extract<SERVICE, UnknownModule>>

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
