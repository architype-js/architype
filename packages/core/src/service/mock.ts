import { moduleBase } from "#service/main"
import type { ModulePlanGuard } from "#types/guards"
import { assertModulePlan } from "#validation"
import type {
    OriginalService,
    Param,
    PartialModulePlan,
    UnknownModule,
    Mock as MockType
} from "#types/public"

/**
 * Creates a mock version of this module with difsferent dependencies.
 * Mocks are used for creating test variations of a module with different implementations
 * while keeping the same name. This is useful for testing, stubbing, or providing
 * alternative implementations without affecting the original module.
 *
 * @typeParam TYPE2 - The type of the module
 * @typeParam REQUIRED2 - Dependencies for the mock (can be different from the original)
 * @typeParam OPTIONALS2 - Optional dependencies for the mock
 * @param plan - Plan for the mock
 * @param plan.factory - Factory function for the mock
 * @param plan.required - Required dependencies for the mock (can be different from the original)
 * @param plan.optionals - Optional dependencies for the mock
 * @param plan.warmup - Optional function called after the mock factory returns
 * @returns A mock module with mock flag set to true
 * @public
 */
export function Mock() {
    return function mock<
        THIS extends UnknownModule & { _mock: false },
        TYPE2 extends THIS["_type"],
        REQUIRED2 extends OriginalService[] = [],
        OPTIONALS2 extends Param[] = []
    >(
        this: THIS,
        plan: ModulePlanGuard<THIS["tm"], TYPE2, REQUIRED2, OPTIONALS2>
    ): MockType<THIS, TYPE2, REQUIRED2, OPTIONALS2> {
        const modulePlan = plan as PartialModulePlan<
            TYPE2,
            REQUIRED2,
            OPTIONALS2
        >
        assertModulePlan(this.tm, modulePlan)
        const mock = moduleBase(this.tm, modulePlan)

        return {
            ...this,
            ...mock,
            hired: [] as [],
            _mock: true as const,
            _oldReqType: this._reqType,
            _oldSuppliesType: this._suppliesType
        } satisfies MockType<THIS, TYPE2, REQUIRED2, OPTIONALS2> as any
    }
}
