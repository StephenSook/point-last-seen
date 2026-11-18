import Foundation
import Testing
@testable import PLS

@MainActor
@Suite struct FixGateTests {
    @Test func aStaleFinishFromAnEarlierRequestIsIgnored() async {
        let gate = FixGate<Int?>()
        var first: UInt64 = 0
        let a = await gate.wait { token in first = token; gate.finish(1, token: token) }
        #expect(a == 1)
        let b = await gate.wait { token in
            gate.finish(nil, token: first)          // the first request's timer, firing late
            gate.finish(2, token: token)
        }
        #expect(b == 2)
    }

    @Test func aSecondFinishForTheSameRequestDoesNothing() async {
        let gate = FixGate<Int?>()
        let a = await gate.wait { token in gate.finish(5, token: token); gate.finish(6, token: token) }
        #expect(a == 5)
        #expect(gate.isWaiting == false)
    }
}
