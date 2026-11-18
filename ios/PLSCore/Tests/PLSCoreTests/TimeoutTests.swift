import Foundation
import Testing
@testable import PLSCore

@Suite struct TimeoutTests {
    @Test func aCallThatTakesTooLongGivesNilQuickly() async {
        let start = Date()
        let v: Int? = await Timeout.run(seconds: 0.1) { try? await Task.sleep(for: .seconds(30)); return 1 }
        #expect(v == nil)
        #expect(Date().timeIntervalSince(start) < 5)
    }

    @Test func aQuickCallGivesItsValue() async {
        #expect(await Timeout.run(seconds: 5) { 7 } == 7)
    }
}
