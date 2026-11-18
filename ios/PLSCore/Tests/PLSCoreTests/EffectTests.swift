import Foundation
import Testing
@testable import PLSCore

@Suite struct EffectTests {
    @Test func expectVectorIsExactForStrings() {
        #expect(throws: VectorMismatch.self) {
            try expectVector(.object(["why": .string("invalid")]), .object(["why": .string("sound_only")]))
        }
    }

    @Test func expectVectorToleratesTinyNumberDifferencesButNotMissingKeys() throws {
        try expectVector(.object(["a": .number(1 + 1e-14)]), .object(["a": .number(1)]))
        #expect(throws: VectorMismatch.self) {
            try expectVector(.object(["a": .number(1)]), .object(["a": .number(1), "b": .number(2)]))
        }
        #expect(throws: VectorMismatch.self) { try expectVector(.bool(true), .number(1)) }
    }

    @Test func expectVectorRejectsNonFiniteNumbers() {
        #expect(throws: VectorMismatch.self) { try expectVector(.number(.infinity), .number(2808)) }
        #expect(throws: VectorMismatch.self) { try expectVector(.number(-.infinity), .number(-1)) }
        #expect(throws: VectorMismatch.self) { try expectVector(.number(.nan), .number(0.5)) }
        #expect(near(.infinity, 2808) == false)
    }

    @Test func clearedEffectEncodesToSpecJSON() throws {
        let e = Effect.cleared(
            segmentId: "AC", pod: 0.5,
            inputs: ClearedInputs(coverage: 0.8, sweepWidthM: nil, trackLengthM: nil, areaM2: 15625, rdBasis: .default)
        )
        try expectVector(JSONValue(encoding: e), .object([
            "kind": .string("cleared"), "segmentId": .string("AC"), "pod": .number(0.5),
            "inputs": .object([
                "coverage": .number(0.8), "sweepWidthM": .null, "trackLengthM": .null,
                "areaM2": .number(15625), "rdBasis": .string("default")
            ])
        ]))
        #expect(e.clearedSegmentId == "AC")
        #expect(e.pod == 0.5)
    }

    @Test func clueAndNoneEncodeToSpecJSON() throws {
        let clue = Effect.clue(influences: ["AB": .strongFor, "AC": .for], authenticity: .medium)
        try expectVector(JSONValue(encoding: clue), .object([
            "kind": .string("clue"),
            "influences": .object(["AB": .string("strong_for"), "AC": .string("for")]),
            "authenticity": .string("medium")
        ]))
        try expectVector(JSONValue(encoding: Effect.none(why: .soundOnly)), .object(["kind": .string("none"), "why": .string("sound_only")]))
        #expect(clue.clearedSegmentId == nil)
        #expect(clue.pod == nil)
    }

    @Test func effectRoundTripsThroughJSON() throws {
        for e in [
            Effect.cleared(segmentId: "AA", pod: 0.25, inputs: ClearedInputs(coverage: 0.3, sweepWidthM: 16.45, trackLengthM: 3159, areaM2: 1e5, rdBasis: .hiddenTarget)),
            .clue(influences: ["AA": .against], authenticity: .high),
            .none(why: .incorporatedInPrior)
        ] {
            let data = try JSONEncoder().encode(e)
            #expect(try JSONDecoder().decode(Effect.self, from: data) == e)
        }
    }

    @Test func unknownEffectKindFailsToDecode() {
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(Effect.self, from: Data(#"{"kind":"teleport"}"#.utf8))
        }
    }
}
