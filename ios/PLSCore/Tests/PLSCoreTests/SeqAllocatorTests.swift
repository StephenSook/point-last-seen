import Foundation
import Testing
@testable import PLSCore

@Suite struct SeqAllocatorTests {
    func url() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent("seq-\(UUID().uuidString).json") }

    @Test func aFreshInstallStartsAtTheCurrentEpochMilliseconds() throws {
        var s = try SeqAllocator(fileURL: url(), nowMs: 1_795_860_000_000)
        #expect(try s.next() == 1_795_860_000_000)
        #expect(try s.next() == 1_795_860_000_001)
    }

    @Test func theCounterSurvivesARestart() throws {
        let u = url()
        var a = try SeqAllocator(fileURL: u, nowMs: 1_000)
        _ = try a.next(); _ = try a.next()
        var b = try SeqAllocator(fileURL: u, nowMs: 5)                // a clock that moved back changes nothing
        #expect(try b.next() == 1_002)
    }

    @Test func aFailedWriteDoesNotHandOutTheNumber() throws {
        let blocker = FileManager.default.temporaryDirectory.appendingPathComponent("seq-block-\(UUID().uuidString)")
        try Data("x".utf8).write(to: blocker)
        var s = try SeqAllocator(fileURL: blocker.appendingPathComponent("seq.json"), nowMs: 10)
        #expect(throws: (any Error).self) { try s.next() }
        try FileManager.default.removeItem(at: blocker)
        #expect(try s.next() == 10)                                    // the failed number was not used
    }
}
