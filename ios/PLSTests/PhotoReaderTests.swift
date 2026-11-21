import CoreGraphics
import Foundation
import PLSCore
import Testing
@testable import PLS

/// The photo read fails closed: the photo is kept only when the description came back and the separate person
/// question answered a clean no. One read at a time, and the reader lets go of the image when it gives up.
@Suite struct PhotoReaderTests {
    static let cap = PhotoDescription(showsPerson: false, object: "red cap", color: .red, kind: .hat)

    static func isDescribed(_ r: PhotoReadResult, person: Bool) -> Bool {
        if case let .described(d, _, _) = r { return d.showsPerson == person }
        return false
    }

    @Test func aDescriptionAndACleanNoKeepThePhoto() {
        #expect(Self.isDescribed(PhotoReader.combine(Self.cap, person: .no, model: "m", latencyMs: 1), person: false))
    }

    @Test func aYesOnEitherQuestionMarksAPerson() {
        #expect(Self.isDescribed(PhotoReader.combine(Self.cap, person: .yes, model: "m", latencyMs: 1), person: true))
        var flagged = Self.cap
        flagged.showsPerson = true
        #expect(Self.isDescribed(PhotoReader.combine(flagged, person: .no, model: "m", latencyMs: 1), person: true))
    }

    @Test func noAnswerToEitherQuestionKeepsNothing() {
        if case .failed = PhotoReader.combine(Self.cap, person: nil, model: "m", latencyMs: 1) {} else { Issue.record("no person answer kept the photo") }
        if case .failed = PhotoReader.combine(nil, person: .no, model: "m", latencyMs: 1) {} else { Issue.record("no description kept the photo") }
    }

    /// A model call that ignores cancellation, as a stalled one does: it answers after `seconds`, whatever happens.
    static func stall<T: Sendable>(_ seconds: Double, then value: T) async -> T {
        await withCheckedContinuation { c in DispatchQueue.global().asyncAfter(deadline: .now() + seconds) { c.resume(returning: value) } }
    }

    final class Count: @unchecked Sendable { var n = 0 }

    static func onePixel() throws -> CGImage {
        let ctx = try #require(CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        return try #require(ctx.makeImage())
    }

    /// A stalled person question: the read gives up at its limit, keeps nothing, and the next photo can be read.
    @Test func aStalledReadFreesTheGateAtItsLimit() async throws {
        let gate = PhotoReadGate()
        let r = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 0.2, gate: gate, model: "m",
                                      askPerson: { _ in await Self.stall(2, then: PersonAnswer.no) }, describe: { _ in Self.cap })
        if case .failed = r {} else { Issue.record("a timed-out read kept the photo") }
        #expect(gate.tryStart())
    }

    /// An answer that comes after the limit starts no second model call.
    @Test func aLateNoStartsNoDescription() async throws {
        let described = Count()
        _ = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 0.2, gate: PhotoReadGate(), model: "m",
                                  askPerson: { _ in await Self.stall(0.5, then: PersonAnswer.no) },
                                  describe: { _ in described.n += 1; return Self.cap })
        try await Task.sleep(for: .seconds(1))
        #expect(described.n == 0)
    }

    /// The worker that finishes late does not open the gate of a read that started after the limit.
    @Test func aLateWorkerLeavesTheNextReadsGateAlone() async throws {
        let gate = PhotoReadGate()
        _ = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 0.2, gate: gate, model: "m",
                                  askPerson: { _ in await Self.stall(0.6, then: PersonAnswer.yes) }, describe: { _ in Self.cap })
        #expect(gate.tryStart())               // the next read holds the gate
        try await Task.sleep(for: .seconds(1)) // the first worker finishes meanwhile
        #expect(gate.tryStart() == false)      // and has not opened it
    }

    /// The read's mission is checked before each model call: once it is not current, no further call starts.
    @Test func noModelCallStartsOnceTheMissionIsNotCurrent() async throws {
        let asked = Count(), described = Count()
        let r = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 5, gate: PhotoReadGate(), model: "m",
                                      askPerson: { _ in asked.n += 1; return .no }, describe: { _ in described.n += 1; return Self.cap },
                                      stillCurrent: { false })
        #expect(asked.n == 0 && described.n == 0)
        if case .failed = r {} else { Issue.record("a read for a mission that changed kept the photo") }
        final class Flag: @unchecked Sendable { var current = true }
        let flag = Flag()
        _ = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 5, gate: PhotoReadGate(), model: "m",
                                  askPerson: { _ in flag.current = false; return .no }, describe: { _ in described.n += 1; return Self.cap },
                                  stillCurrent: { flag.current })
        #expect(described.n == 0)
    }

    @Test func aReadWithinItsLimitDescribesThePhoto() async throws {
        let r = await PhotoReader.run(try Self.onePixel(), timeoutSeconds: 5, gate: PhotoReadGate(), model: "m",
                                      askPerson: { _ in .no }, describe: { _ in Self.cap })
        #expect(Self.isDescribed(r, person: false))
    }

    @Test func onlyOneReadRunsAtATime() {
        let gate = PhotoReadGate()
        #expect(gate.tryStart())
        #expect(gate.tryStart() == false)
        gate.end()
        #expect(gate.tryStart())
    }

    @Test func theHolderLetsGoOfTheImage() throws {
        let ctx = try #require(CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        let holder = ImageHolder(try #require(ctx.makeImage()))
        #expect(holder.image != nil)
        holder.release()
        #expect(holder.image == nil)
    }
}
