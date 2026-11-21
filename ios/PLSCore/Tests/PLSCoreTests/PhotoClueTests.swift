import Foundation
import Testing
@testable import PLSCore

/// A photo of something found: Apple's model only describes it, and code decides everything else. A photo that
/// shows any part of a person is never kept; a described object is compared with the family's described items by
/// kind and color, never marked down on a guess.
@Suite struct PhotoClueTests {
    static func profile(_ clothing: String? = nil, appearance: String? = nil, aids: [String]? = nil) -> ModelProfile {
        var p = ModelProfile(shared: .object([:]))
        p.clothingLastWorn = clothing
        p.appearance = appearance
        p.mobilityAids = aids
        return p
    }
    static let worn = profile("navy windbreaker, gray sweatpants, a red baseball cap and white sneakers")
    static func photo(_ object: String, _ color: ClothingColor, _ kind: PhotoObjectKind, person: Bool = false) -> PhotoDescription {
        PhotoDescription(showsPerson: person, object: object, color: color, kind: kind)
    }
    static func clue(_ out: PhotoClue.Outcome) -> PhotoClue.Clue? { if case let .clue(c) = out { c } else { nil } }

    @Test func aPhotoThatShowsAPersonIsNotKept() {
        let out = PhotoClue.decide(Self.photo("red baseball cap", .red, .hat, person: true), profile: Self.worn, segmentIds: ["AE"])
        #expect(out == .discarded(PhotoClue.personMessage))
    }

    @Test func aPersonOrBodyWordInTheObjectIsNotKept() {
        for object in ["man in a red cap", "woman's hand", "hand holding a cap", "a child", "face", "people by a creek", "two hikers"] {
            #expect(PhotoClue.decide(Self.photo(object, .red, .hat), profile: Self.worn, segmentIds: ["AE"]) == .discarded(PhotoClue.personMessage), "\(object)")
        }
    }

    /// Plurals, Spanish, more body parts and a word spelled out letter by letter are a person too.
    @Test func everyWayOfNamingAPersonIsNotKept() {
        for object in ["remains", "bodies by a creek", "a corpse", "corpses", "niño", "niña con gorra", "niños", "hombre", "mujer",
                       "persona", "cuerpo", "shoe with an ankle", "a wrist with a watch", "torso", "m.a.n", "m a n", "W-O-M-A-N", "babies"] {
            #expect(PhotoClue.decide(Self.photo(object, .red, .other), profile: Self.worn, segmentIds: []) == .discarded(PhotoClue.personMessage), "\(object)")
        }
    }

    /// A person word inside a longer word is not a person: a handbag, a backpack, a manual.
    @Test func aPersonWordInsideAnotherWordIsKept() {
        for object in ["handbag", "backpack", "manual", "mandolin", "armband", "legging"] {
            #expect(Self.clue(PhotoClue.decide(Self.photo(object, .red, .other), profile: Self.worn, segmentIds: [])) != nil, "\(object)")
        }
    }

    /// State words a report uses for a person ("walking", "sitting", "safe") are not a person in a photo.
    @Test func anObjectNamedWithAStateWordIsKept() {
        for object in ["walking stick", "sitting pad", "safety vest", "fine-knit glove"] {
            #expect(Self.clue(PhotoClue.decide(Self.photo(object, .brown, .other), profile: Self.worn, segmentIds: [])) != nil, "\(object)")
        }
    }

    @Test func aDescribedItemOfTheSameKindAndColorIsConsistent() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("red baseball cap", .red, .hat), profile: Self.worn, segmentIds: ["AE"])))
        #expect(c.reading.matchesProfile == .consistent)
        #expect(c.matchedPhrase == "a red baseball cap")
    }

    /// Spike 1's error: a cap of another color is not the described cap.
    @Test func theSameKindInAnotherColorIsNotAMatch() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("black baseball cap", .black, .hat), profile: Self.worn, segmentIds: ["AE"])))
        #expect(c.reading.matchesProfile == .unknown)
        #expect(c.matchedPhrase == nil)
    }

    @Test func colorNamesTheFamilyUsesCountAsTheirColor() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("blue jacket", .blue, .coat), profile: Self.worn, segmentIds: ["AE"])))
        #expect(c.matchedPhrase == "navy windbreaker")
        let grey = try #require(Self.clue(PhotoClue.decide(Self.photo("grey hoodie", .gray, .shirt), profile: Self.profile("a grey hoodie"), segmentIds: [])))
        #expect(grey.reading.matchesProfile == .consistent)
    }

    @Test func aDescribedItemWithNoColorMatchesOnKind() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("wooden cane", .brown, .cane), profile: Self.profile(aids: ["cane"]), segmentIds: [])))
        #expect(c.reading.matchesProfile == .consistent)
        #expect(c.matchedPhrase == "cane")
    }

    @Test func anUnknownColorNeverConfirmsAColoredItem() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("baseball cap", .unknown, .hat), profile: Self.worn, segmentIds: [])))
        #expect(c.reading.matchesProfile == .unknown)
    }

    @Test func coatsAndShirtsAreDifferentKindsAndOtherIsNeverAMatch() throws {
        let shirt = try #require(Self.clue(PhotoClue.decide(Self.photo("gray sweatshirt", .gray, .shirt), profile: Self.profile("gray hoodie"), segmentIds: [])))
        #expect(shirt.reading.matchesProfile == .consistent)
        let coat = try #require(Self.clue(PhotoClue.decide(Self.photo("gray jacket", .gray, .coat), profile: Self.profile("gray hoodie"), segmentIds: [])))
        #expect(coat.reading.matchesProfile == .unknown)
        let other = try #require(Self.clue(PhotoClue.decide(Self.photo("red thing", .red, .other), profile: Self.worn, segmentIds: [])))
        #expect(other.reading.matchesProfile == .unknown)
        let none = try #require(Self.clue(PhotoClue.decide(Self.photo("red baseball cap", .red, .hat), profile: Self.profile(), segmentIds: [])))
        #expect(none.reading.matchesProfile == .unknown)
    }

    static func matches(_ photo: PhotoDescription, _ profile: ModelProfile) -> ProfileMatch? {
        clue(PhotoClue.decide(photo, profile: profile, segmentIds: []))?.reading.matchesProfile
    }

    /// Anything the rule cannot read for sure gives unknown, never consistent.
    @Test func whenUnsureTheMatchIsUnknown() {
        // A color the family used that is not on the list.
        #expect(Self.matches(Self.photo("green cap", .green, .hat), Self.profile("teal cap")) == .unknown)
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("red plaid cap")) == .unknown)
        // Only the words right before the item give its color.
        #expect(Self.matches(Self.photo("black cap", .black, .hat), Self.profile("black hair wearing a red cap")) == .unknown)
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("black hair wearing a red cap")) == .consistent)
        // A negation.
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("no red cap")) == .unknown)
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("not wearing a hat")) == .unknown)
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("sin gorra, a coat")) == .unknown)
        // The caption and the color field disagree.
        #expect(Self.matches(Self.photo("black cap", .red, .hat), Self.profile("red cap")) == .unknown)
        // A style word is not a color; with no color named, the kind decides.
        #expect(Self.matches(Self.photo("red cap", .red, .hat), Self.profile("a baseball cap")) == .consistent)
    }

    @Test func theReadingIsAClueWhoseQuoteIsInTheText() throws {
        let c = try #require(Self.clue(PhotoClue.decide(Self.photo("Black Baseball Cap", .black, .hat), profile: Self.worn, segmentIds: ["AE"])))
        #expect(c.rawText == "Photo: black baseball cap.")
        #expect(c.reading.kind == .clue && c.reading.segmentIds == ["AE"] && c.reading.item == "black baseball cap")
        #expect(c.reading.evidenceQuote == "black baseball cap" && c.rawText.contains(c.reading.evidenceQuote))
        #expect(c.reading.feature == .none && c.reading.topColor == .unknown)
    }

    @Test func theObjectIsCleanedAndKeptShort() throws {
        let digits = try #require(Self.clue(PhotoClue.decide(Self.photo("cap 404 555 0142!", .red, .hat), profile: Self.worn, segmentIds: [])))
        #expect(digits.reading.item == "cap")
        let long = try #require(Self.clue(PhotoClue.decide(Self.photo("very old faded red and white striped knit winter hat", .red, .hat), profile: Self.worn, segmentIds: [])))
        #expect(long.reading.item.count <= 40 && !long.reading.item.hasSuffix(" ") && long.rawText.contains(long.reading.item))
        let empty = try #require(Self.clue(PhotoClue.decide(Self.photo(" 12 ", .red, .glove), profile: Self.worn, segmentIds: [])))
        #expect(empty.reading.item == "glove")
        let other = try #require(Self.clue(PhotoClue.decide(Self.photo("", .unknown, .other), profile: Self.worn, segmentIds: [])))
        #expect(other.reading.item == "object")
    }
}
