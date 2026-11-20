import Foundation
import Testing
@testable import PLSCore

/// On the phone, code decides whether a report matches the subject's description: Apple's model reads
/// the report alone. Conservative: consistent only when a colour or item word of the report is in the
/// description; otherwise unknown, so no clue is ever marked down on a guess.
@Suite struct ProfileMatchTests {
    let profile = ModelProfile(shared: .object(["clothingLastWorn": .string("blue coat, gray pants"), "hair": .string("white, short")]))

    func r(top: ClothingColor = .unknown, bottom: ClothingColor = .unknown, item: String = "", footwear: String = "") -> ReportReading {
        var x = reading(kind: .clue)
        x.topColor = top
        x.bottomColor = bottom
        x.item = item
        x.footwear = footwear
        return x
    }

    @Test func aColourOrItemInTheDescriptionIsConsistent() {
        #expect(ProfileMatch.decide(r(top: .blue), profile: profile) == .consistent)
        #expect(ProfileMatch.decide(r(item: "a coat"), profile: profile) == .consistent)
        #expect(ProfileMatch.decide(r(bottom: .gray), profile: profile) == .consistent)
    }

    @Test func nothingInCommonOrNothingToCompareIsUnknown() {
        #expect(ProfileMatch.decide(r(top: .red), profile: profile) == .unknown)
        #expect(ProfileMatch.decide(r(), profile: profile) == .unknown)
        #expect(ProfileMatch.decide(r(top: .blue), profile: ModelProfile(shared: .null)) == .unknown)
        #expect(ProfileMatch.decide(r(item: "the"), profile: profile) == .unknown)
    }
}
