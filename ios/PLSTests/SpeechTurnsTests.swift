import Foundation
import Testing
@testable import PLS

/// The phone's own voice keeps track of which line it is on: each synthesizer callback answers
/// only its own line, and a new line waits until the one before has ended.
@MainActor
@Suite struct SpeechTurnsTests {
    final class Line {}

    @Test func aCallbackForAnotherLineIsIgnored() async {
        let turns = SpeechTurns(), a = Line(), b = Line()
        var heard: Bool?
        let speaking = Task { heard = await turns.run(a) {} }
        await Task.yield()
        turns.didStart(ObjectIdentifier(b))
        turns.didEnd(ObjectIdentifier(b))
        await Task.yield()
        #expect(heard == nil && turns.busy)
        turns.didStart(ObjectIdentifier(a))
        await speaking.value
        #expect(heard == true)
    }

    @Test func aLineThatEndsBeforeItStartsWasNotHeard() async {
        let turns = SpeechTurns(), a = Line()
        let speaking = Task { await turns.run(a) {} }
        await Task.yield()
        turns.didEnd(ObjectIdentifier(a))
        #expect(await speaking.value == false)
        #expect(!turns.busy)
    }

    @Test func theNextLineWaitsUntilTheOneBeforeHasEnded() async {
        let turns = SpeechTurns(), a = Line()
        let first = Task { await turns.run(a) {} }
        await Task.yield()
        turns.didStart(ObjectIdentifier(a))
        _ = await first.value
        var turnCame = false
        let next = Task { await turns.waitForTurn(); turnCame = true }
        for _ in 0..<50 { await Task.yield() }
        #expect(!turnCame)
        turns.didEnd(ObjectIdentifier(a))
        await next.value
        #expect(turnCame)
    }

    /// A stop ends the line on the spot, also when the synthesizer never calls back, and a late
    /// callback for that line changes nothing.
    @Test func endingAllReleasesTheLineAndEveryWaiter() async {
        let turns = SpeechTurns(), a = Line()
        let first = Task { await turns.run(a) {} }
        await Task.yield()
        let next = Task { await turns.waitForTurn() }
        await Task.yield()
        turns.endAll()
        #expect(await first.value == false)
        await next.value
        #expect(!turns.busy)
        turns.didEnd(ObjectIdentifier(a))
        #expect(!turns.busy)
    }
}
