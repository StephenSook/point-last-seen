import Testing
@testable import PLSCore

@Suite struct AppVersionTests {
    @Test func comparesPartByPartAsNumbers() {
        #expect(AppVersion.isBelow("0.1.0", minimum: "0.2.0"))
        #expect(AppVersion.isBelow("0.9.0", minimum: "0.10.0"))           // numbers, not text
        #expect(AppVersion.isBelow("1.2", minimum: "1.2.1"))              // a missing part is 0
        #expect(!AppVersion.isBelow("1.2.0", minimum: "1.2"))
        #expect(!AppVersion.isBelow("0.2.0", minimum: "0.1.9"))
        #expect(!AppVersion.isBelow("0.1.0", minimum: "0.1.0"))
        #expect(AppVersion.isBelow("0.1.0", minimum: " 0.2.0 "))         // spaces are trimmed
    }

    @Test func anUnreadableVersionNeverAsksForAnUpdate() {
        #expect(!AppVersion.isBelow("0.1.0", minimum: ""))
        #expect(!AppVersion.isBelow("0.1.0", minimum: "latest"))
        #expect(!AppVersion.isBelow("0.1.0", minimum: "1.x"))
        #expect(!AppVersion.isBelow("", minimum: "9.0.0"))
    }
}
