import type { UnknownModulePlan } from "#types/internal"
import type {
    Supplier,
    UnknownService,
    Param,
    Module,
    UnknownModule
} from "#types/public"
import type { UnionToIntersection } from "#utils"

export type MaybeFn<A extends any[], R> = R | ((...args: A) => R)

/**
 * A generic map of suppliers. `undefined` is a missing non-inited param
 * (not a stamped supplier).
 * @public
 */
export type RegistryRecord<SERVICE extends UnknownService = UnknownService> =
    Record<string, MaybeFn<[], Supplier<SERVICE>> | undefined>

/**
 * A generic map of resolved supplies
 * @public
 */
export type MarketRecord<SERVICE extends UnknownService = UnknownService> =
    Record<string, Supplier<SERVICE>>

/**
 * A generic map of suppliers or undefined. Undefined used to force a supplier not to be preserved across request scopes.
 * @public
 */
export type RegistryOrUndefinedRecord<
    SERVICE extends UnknownService = UnknownService
> = Record<string, MaybeFn<[], Supplier<SERVICE>> | undefined>

type FindSupplierFirstAppearanceInServiceTuple<
    SERVICES extends UnknownService[],
    KEY extends "_reqType" | "_suppliesType",
    NAME extends PropertyKey
> =
    SERVICES extends [infer Head, ...infer Tail] ?
        Tail extends UnknownService[] ?
            Head extends UnknownModule ?
                NAME extends keyof Head[KEY] ?
                    Head[KEY][NAME]
                :   FindSupplierFirstAppearanceInServiceTuple<Tail, KEY, NAME>
            :   FindSupplierFirstAppearanceInServiceTuple<Tail, KEY, NAME>
        :   never
    :   never

type RequestBase<
    PLAN extends Pick<UnknownModulePlan, "optionals"> & {
        required: UnknownService[]
    }
> = {
    [SERVICE in Extract<PLAN["required"][number], Param> as [
        SERVICE["_init"]
    ] extends [never] ?
        SERVICE["tm"]
    :   never]: Supplier<SERVICE>
} & {
    [SERVICE in Extract<PLAN["required"][number], Param> as [
        SERVICE["_init"]
    ] extends [never] ?
        never
    :   SERVICE["tm"]]?: Supplier<SERVICE>
} & {
    [OPTIONAL in
        | PLAN["optionals"][number]
        | Exclude<
              PLAN["required"][number],
              Param
          > as OPTIONAL["tm"]]?: OPTIONAL extends Param ?
        Supplier<OPTIONAL>
    : OPTIONAL extends UnknownModule ?
        Supplier<
            Module<
                OPTIONAL["tm"],
                OPTIONAL["_type"],
                OPTIONAL["_optionalKeys"],
                OPTIONAL["_caller"],
                Partial<MarketRecord<UnknownService>>,
                OPTIONAL["_hired"],
                OPTIONAL["_mock"],
                OPTIONAL["_awaited"]
            >
        >
    :   never
}

export type Request<
    PLAN extends Pick<UnknownModulePlan, "optionals"> & {
        required: UnknownService[]
    }
> =
    any[] extends PLAN["required"] ? any
    :   RequestBase<PLAN> & {
            [NAME in keyof UnionToIntersection<
                Extract<PLAN["required"][number], UnknownModule>["_reqType"]
            > as NAME extends keyof RequestBase<PLAN> ? never
            :   NAME]: FindSupplierFirstAppearanceInServiceTuple<
                PLAN["required"],
                "_reqType",
                NAME
            >
        }

export type Market<MODULE extends UnknownModule> = {
    [NAME in keyof MODULE["_reqType"]]-?: NonNullable<MODULE["_reqType"][NAME]>
}

export type MarketPlan<
    PLAN extends Pick<UnknownModulePlan, "optionals"> & {
        required: UnknownService[]
    }
> = {
    [NAME in keyof Request<PLAN>]-?: Request<PLAN>[NAME]
}

type SuppliesPlanBase<
    PLAN extends Pick<UnknownModulePlan, "optionals"> & {
        required: UnknownService[]
    }
> = {
    [SERVICE in
        | PLAN["required"][number]
        | PLAN["optionals"][number] as SERVICE["tm"]]: SERVICE extends (
        PLAN["required"][number]
    ) ?
        SERVICE["_type"]
    :   SERVICE["_type"] | undefined
}

export type SuppliesPlan<
    PLAN extends Pick<UnknownModulePlan, "optionals"> & {
        required: UnknownService[]
    }
> =
    any[] extends PLAN["required"] ? any
    :   SuppliesPlanBase<PLAN> & {
            [NAME in keyof UnionToIntersection<
                Extract<
                    PLAN["required"][number],
                    UnknownModule
                >["_suppliesType"]
            > as NAME extends keyof SuppliesPlanBase<PLAN> ? never
            :   NAME]: FindSupplierFirstAppearanceInServiceTuple<
                PLAN["required"],
                "_suppliesType",
                NAME
            >
        }

type SuppliesBase<REQUEST extends Partial<MarketRecord<UnknownService>>> = {
    [NAME in keyof Required<REQUEST>]: Required<REQUEST>[NAME] extends (
        Supplier<infer SERVICE>
    ) ?
        SERVICE["_type"]
    :   never
}

/**
 * Unwrapped values from a request map. Mirrors {@link Market}'s projection of
 * {@link Request}: optional request keys that are non-inited params become
 * `T | undefined`; required params, inited required params, and required-module
 * overrides stay non-nullable.
 */
export type Supplies<
    REQUEST extends Partial<MarketRecord<UnknownService>>
> =
    string extends keyof Required<REQUEST> ? any
    :   {
            [NAME in keyof SuppliesBase<REQUEST>]:
                | SuppliesBase<REQUEST>[NAME]
                | (NAME extends keyof REQUEST ?
                    undefined extends REQUEST[NAME] ?
                        Required<REQUEST>[NAME] extends Supplier<infer SERVICE> ?
                            SERVICE extends Param ?
                                [SERVICE["_init"]] extends [never] ?
                                    undefined
                                :   never
                            :   never
                        :   never
                    :   never
                :   never)
        }
