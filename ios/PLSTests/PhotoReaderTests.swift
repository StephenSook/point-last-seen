import CoreGraphics
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
