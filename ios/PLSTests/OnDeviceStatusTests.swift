import PLSCore
import Testing
@testable import PLS

@Suite struct OnDeviceStatusTests {
    @Test func theModelNameIsNeverEmpty() {
        // The iOS 27.2 simulator reports the model available with an empty variant name; the
        // route record and the Ready check still need a name.
        #expect(ModelSessionFactory.onDeviceStatus().variant.isEmpty == false)
    }
}
