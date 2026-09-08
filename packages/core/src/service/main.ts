import { caching } from "#service/caching"
import { request, provision } from "#service/request"
import { _resolve } from "#service/resolve"
import type { Supplies, Request } from "#types/records"
import type { PartialModulePlan, Supplier } from "#types/public"
import type {
    Module,
    OptionalService,
    OriginalService,
    Param,
    UnknownService
} from "#types/public"
import { assertTM, assertModulePlan } from "#validation"
import { dedupe, isModule, simpleId } from "#utils"

/** Properties shared by params and modules (trademark, `.of`, `.init`). */
export function shared<TM extends string, TYPE = any>(tm: TM) {
    assertTM(tm)
    return {
        tm,
        of<THIS extends UnknownService, VALUE extends THIS["_type"]>(
            this: THIS,
            value: VALUE
        ): Supplier<THIS> {
            return {
                get: () => value,
                supplies: {} as never,
                market: {} as never,
                service: this,
                _ctx: (() => null) as never,
                _requested: true as const
            } as any
        },
        init<THIS extends Param>(this: THIS, value: THIS["_type"]) {
            return { ...this, _init: value, _inited: true as const } as Param<
                THIS["tm"],
                THIS["_type"],
                THIS["_type"]
            >
        },
        _type: null as unknown as TYPE,
        _mock: false as const,
        _init: undefined as never,
        _inited: false as const,
        _maybe: false as const
    }
}

/**
 * Module graph node without `mock` / `hire`. Used by `service().module` and by
 * `Mock()` (which must not re-enter the mock/hire attachment).
 */
export function moduleBase<
    TM extends string,
    TYPE,
    REQUIRED extends OriginalService[] = [],
    OPTIONALS extends OptionalService[] = [],
    REQUEST extends Request<{
        required: REQUIRED
        optionals: OPTIONALS
    }> = Request<{
        required: REQUIRED
        optionals: OPTIONALS
    }>
>(
    tm: TM,
    plan: PartialModulePlan<TYPE, REQUIRED, OPTIONALS>
): Omit<
    Module<
        TM,
        TYPE,
        OPTIONALS[number]["tm"],
        undefined,
        REQUEST,
        [],
        boolean,
        boolean
    >,
    "mock" | "hire" | "_mock"
> {
    assertModulePlan(tm, plan)

    const required = plan.required ?? []
    const optionals = plan.optionals ?? []
    const planAwaited = plan.awaited === true
    const depsAwaited = [...required, ...optionals].some(
        (service) => isModule(service) && service._awaited
    )
    const _awaited = planAwaited || depsAwaited
    const _maybe = plan.maybe === true

    const _team = team(tm, required, optionals)
    const _reqType = null as unknown as REQUEST
    const _suppliesType = null as unknown as Supplies<REQUEST>

    return {
        ...shared<TM, TYPE>(tm),
        request,
        provision,
        invalidate() {
            if (!this._caching) {
                throw new Error(
                    `Cannot invalidate "${this.tm}" because invalidate() only applies to cached modules.`
                )
            }
            this._version += 1
        },
        caching,
        _factory: plan.factory,
        _resolve,
        _required: required,
        _optionals: optionals,
        _team,
        _hired: [] as [],
        _warmup: plan.warmup,
        _version: 0,
        _param: false as const,
        _module: true as const,
        _awaited,
        _type: null as unknown as TYPE,
        _caller: undefined,
        _optionalKeys: null as unknown as OPTIONALS[number]["tm"],
        _reqType,
        _suppliesType,
        _oldReqType: _reqType,
        _oldSuppliesType: _suppliesType,
        _implementId: simpleId(),
        _maybe
    }
}

export function team(
    tm: string,
    required: UnknownService[],
    optionals: OptionalService[]
) {
    return dedupe(
        [...required, ...optionals]
            .flatMap((service) => {
                if (isModule(service)) {
                    return [service, ...service._team]
                }
                return [service]
            })
            .map((s) => {
                if (s.tm === tm) {
                    throw new Error("Circular dependency detected")
                }
                return s
            }),
        tm
    )
}
