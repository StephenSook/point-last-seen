import Foundation

/// Checks a model's "found" against its note (shared/test-vectors/found-kind.json; reference
/// shared/engine-ts/src/found.ts). A model can read "Found a blue coat by the creek" as the person found: the command
/// post then says Found, and the coat's clue value is lost.
///
/// A person-found note read as a clue is the one wrong answer that must never happen, so the rule is conservative by
/// construction: it corrects only a note made entirely of words it knows to describe an object (`objectNoteWords`),
/// where every "found" is followed by a determiner and a known object, and no word names a person (`personWords`, a
/// profile name). Any other note, including one with a single unknown word, keeps the model's kind. The corrected
/// reading takes its item and place from the note the way the rules parser reads them, and the reason, shown on the
/// report's receipt, says the model said found.
public struct FoundKind: Sendable {
    public static let reason = "Read as a clue: an object was found, not the person. The model said found; check the note."

    /// Words that could mean the person was found: pronouns and the rules parser's subject words, words for a person,
    /// family and relations, the person's state, and the response to a found person. None is ever an object-note word;
    /// "her" is also a possessive (see `possessiveHer`).
    public static let personWords: Set<String> = [
        "he", "she", "they", "him", "her", "them", "subject", "person", "patient", "someone", "somebody",
        "man", "woman", "lady", "gentleman", "guy", "boy", "girl", "child", "kid", "baby", "toddler", "teen", "mr", "mrs", "ms",
        "sir", "body", "victim",
        "grandma", "grandpa", "grandmother", "grandfather", "granny", "nana", "papa", "mom", "mum", "mama", "mother", "dad",
        "father", "wife", "husband", "partner", "aunt", "uncle", "sister", "brother", "son", "daughter", "grandson",
        "granddaughter", "niece", "nephew", "cousin", "friend", "neighbor",
        "located", "safe", "alive", "conscious", "unconscious", "awake", "alert", "responsive", "unresponsive", "talking",
        "breathing", "hurt", "injured", "bleeding", "ok", "okay", "fine", "dead", "deceased", "hypothermic", "rescued",
        "sitting", "standing", "walking", "wandering", "sleeping", "crying",
        "ambulance", "ems", "medic", "medics", "paramedic", "paramedics", "911", "hospital", "cpr",
    ]
    /// Things a person drops or leaves behind. A "found a man" or "found a woman" is not one, so it is never corrected.
    static let objects: Set<String> = [
        "coat", "jacket", "shoe", "shoes", "hat", "cap", "glove", "gloves", "mitten", "mittens", "bag", "backpack", "purse", "handbag",
        "phone", "wallet", "keys", "key", "scarf", "glasses", "sunglasses", "cane", "walker", "id", "badge", "slipper", "slippers",
        "boot", "boots", "sandal", "sandals", "sock", "socks", "sweater", "hoodie", "shirt", "blanket", "umbrella", "watch",
        "bracelet", "card", "cards", "belt", "hearing", "aid", "dentures", "pill", "pills", "medication", "bottle",
        "wrapper", "cup", "paper", "receipt", "tissue", "napkin", "can", "ticket", "book", "pen", "mask",
    ]
    /// The rules parser's determiners after "found", and the possessives ("found his glasses", "found her coat").
    static let determiners: Set<String> = ["a", "an", "some", "the", "his", "their"]
    /// The rules parser's words that end an item, and its place words.
    static let stopWords: Set<String> = ["by", "near", "in", "on", "at", "under", "next", "beside", "and", "with", "from", "to", "of", "heading", "close"]
    static let features: [(Feature, [String])] = [
        (.creekOrDrainage, ["creek", "stream", "drainage", "ditch", "gully", "brook", "culvert", "creekbed"]),
        (.water, ["pond", "lake", "river", "water", "swamp", "marsh"]),
        (.road, ["road", "street", "highway", "driveway"]),
        (.trail, ["trail", "path", "footpath"]),
        (.structure, ["house", "shed", "barn", "building", "structure", "cabin", "garage"]),
        (.brush, ["brush", "bushes", "bush", "thicket", "briars"]),
        (.woods, ["woods", "forest", "trees", "treeline"]),
        (.field, ["field", "meadow", "pasture", "clearing"]),
    ]
    static let otherObjectNoteWords: [String] = [
        "clue", "clues", "item", "track", "tracks", "footprint", "footprints", "print", "prints", "dropped",
        "fence", "bridge", "bench", "tree", "parking", "lot", "porch", "yard", "rock", "rocks", "hill", "hillside", "slope",
        "ridge", "gate", "wall", "sidewalk", "curb", "playground", "picnic", "table", "shelter", "steps", "stairs", "boardwalk",
        "dock", "pier", "shore", "mud", "grass", "leaves", "log", "stump", "entrance", "sign", "post", "pole", "pavilion",
        "garden", "lawn", "alley", "corner", "intersection",
        "behind", "beneath", "below", "above", "against", "between", "among", "underneath", "inside", "outside", "over", "past",
        "along", "across", "off", "up", "down", "into", "onto", "toward", "towards", "around", "about",
        "dark", "light", "navy", "beige", "khaki", "maroon", "plaid", "striped",
        "wool", "cotton", "leather", "denim", "plastic", "metal", "wooden", "fleece", "nylon", "rubber", "knit",
        "small", "large", "big", "little", "tiny", "long", "short", "old", "torn", "wet", "muddy", "dirty", "broken", "ripped",
        "snagged", "caught", "hanging", "stuck", "buried", "discarded", "abandoned", "covered", "soaked", "folded", "left",
        "lying",
        "then", "also", "it", "its", "was", "were", "is", "are", "there", "here", "nearby", "just", "one", "two", "three", "pair",
        "side", "edge", "bank", "base", "top", "bottom", "end", "middle", "this", "that", "area", "segment", "team", "we", "our",
        "feet", "ft", "foot", "meters", "metres", "yards", "ago", "min", "mins", "minutes",
    ]
    /// Object-note words that are also given names or surnames ("near Brook", "found a coat near brown"). A colour or
    /// size word counts only inside a found item; a place word only right after a determiner; and neither counts when
    /// written with a capital after the note's first word.
    static let nameLikeDescribers: Set<String> = ["black", "white", "brown", "gray", "grey", "green", "red", "tan", "long", "short"]
    static let nameLikePlaces: Set<String> = ["brook", "river", "hill", "field", "woods", "forest", "wall", "bush", "shore", "post", "rock", "lake"]
    static let itemMax = 40

    /// Every word an object-found note may hold, none of which can name a person: the lists above, the shared colour
    /// and direction words (shared/constants/grounding-words.json), and the other object-note words.
    public let objectNoteWords: Set<String>

    public init(grounding: Grounding) {
        var words: Set<String> = ["found"]
        words.formUnion(Self.determiners)
        words.formUnion(Self.objects)
        words.formUnion(Self.stopWords)
        words.formUnion(Self.features.flatMap(\.1))
        words.formUnion(grounding.colorWords.values.flatMap { $0 })
        words.formUnion(grounding.directionWords.values.flatMap { $0 })
        words.formUnion(Self.otherObjectNoteWords)
        objectNoteWords = words
    }

    /// A run of letters and digits, lowercased, with where it sits in the note (by code point).
    struct Token { let word: String; let raw: String; let start: Int; let end: Int }

    /// The note's scalars and its runs of letters and digits ("she's" is "she" and "s").
    static func tokens(_ text: String) -> (scalars: [Unicode.Scalar], tokens: [Token]) {
        let s = Array(text.unicodeScalars)
        var out: [Token] = []
        var i = 0
        while i < s.count {
            guard isLetterOrNumber(s[i]) else { i += 1; continue }
            var j = i
            while j < s.count, isLetterOrNumber(s[j]) { j += 1 }
            let raw = String(String.UnicodeScalarView(s[i..<j]))
            out.append(Token(word: raw.lowercased(), raw: raw, start: i, end: j))
            i = j
        }
        return (s, out)
    }

    static func words(_ text: String) -> [String] { tokens(text).tokens.map(\.word) }

    static func isLetterOrNumber(_ u: Unicode.Scalar) -> Bool { isLetter(u) || isNumber(u) }

    static func isLetter(_ u: Unicode.Scalar) -> Bool {
        switch u.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: true
        default: false
        }
    }

    static func isNumber(_ u: Unicode.Scalar) -> Bool {
        switch u.properties.generalCategory {
        case .decimalNumber, .letterNumber, .otherNumber: true
        default: false
        }
    }

    /// The note between two tokens is whitespace only, and not empty (`/^\s+$/`).
    static func onlySpaces(_ s: [Unicode.Scalar], _ from: Int, _ to: Int) -> Bool {
        from < to && s[from..<to].allSatisfy { $0.properties.isWhitespace || $0 == "\u{FEFF}" }
    }

    /// "her" right before a known object with only spaces between ("her coat"), so not the person ("found her, coat").
    static func possessiveHer(_ t: [Token], _ i: Int, _ s: [Unicode.Scalar]) -> Bool {
        guard t[i].word == "her", i + 1 < t.count else { return false }
        return objects.contains(t[i + 1].word) && onlySpaces(s, t[i].end, t[i + 1].start)
    }

    /// Where the words after "found a/an/some/the/his/their/her" at t[i] sit: up to three, stopping at a place word,
    /// a number, or punctuation, so an item never runs into the next sentence ("found a hat. brown nearby" is "hat").
    static func itemAfter(_ t: [Token], _ i: Int, _ s: [Unicode.Scalar]) -> [Int] {
        guard i + 1 < t.count, determiners.contains(t[i + 1].word) || possessiveHer(t, i + 1, s) else { return [] }
        var out: [Int] = []
        var j = i + 2
        while j < t.count, out.count < 3, !stopWords.contains(t[j].word), t[j].word.unicodeScalars.first.map(isLetter) == true {
            if j > i + 2, !onlySpaces(s, t[j - 1].end, t[j].start) { break }
            out.append(j)
            j += 1
        }
        return out
    }

    /// Every found item, when every "found" in the note is followed by a determiner and a known object. Nil when any
    /// "found" is not ("found mom", "found Bea", "found him"): whatever it found may be the person.
    static func foundItems(_ t: [Token], _ s: [Unicode.Scalar]) -> [[Int]]? {
        let items = t.indices.filter { t[$0].word == "found" }.map { itemAfter(t, $0, s) }
        if items.isEmpty || items.contains(where: { item in !item.contains { objects.contains(t[$0].word) } }) { return nil }
        return items
    }

    /// True only when every word is one an object-found note may hold where it stands, and none could name the person.
    func onlyObjectWords(_ t: [Token], _ s: [Unicode.Scalar], _ names: [String], _ inItem: Set<Int>) -> Bool {
        let nameWords = Set(names.flatMap(Self.words))
        let trustCodes = s.contains { $0.properties.generalCategory == .lowercaseLetter }
        return t.indices.allSatisfy { i in
            let x = t[i]
            if nameWords.contains(x.word) { return false }
            if x.word == "her" { return Self.possessiveHer(t, i, s) }
            if Self.personWords.contains(x.word) { return false }
            if Self.nameLikeDescribers.contains(x.word) || Self.nameLikePlaces.contains(x.word) {
                if i > 0, x.raw.unicodeScalars.first?.properties.generalCategory == .uppercaseLetter { return false }
                return Self.nameLikeDescribers.contains(x.word) ? inItem.contains(i) : i > 0 && Self.determiners.contains(t[i - 1].word)
            }
            return objectNoteWords.contains(x.word) || x.word.unicodeScalars.allSatisfy(Self.isNumber)
                || (trustCodes && Self.isSegmentCode(x.raw))
        }
    }

    /// A segment id as the grid writes it, two capital letters, typed inside a note that is not all capitals.
    static func isSegmentCode(_ raw: String) -> Bool {
        raw.unicodeScalars.count == 2 && raw.unicodeScalars.allSatisfy { $0.value >= 65 && $0.value <= 90 }
    }

    /// A reading the model read as "found", checked against its note and the missing person's names. Returns the
    /// reading to store, whether it was changed, and the reason to show when it was. The reading given is not changed.
    public func correct(_ reading: ReportReading, note: String, names: [String]) -> (reading: ReportReading, corrected: Bool, reason: String?) {
        let unchanged = (reading, false, String?.none)
        guard reading.kind == .found else { return unchanged }
        let (s, t) = Self.tokens(note)
        guard let items = Self.foundItems(t, s), onlyObjectWords(t, s, names, Set(items.flatMap { $0 })) else { return unchanged }
        let item = items[0].map { t[$0].word }.joined(separator: " ")
        let feature = Self.features.first { place in t.contains { place.1.contains($0.word) } }?.0 ?? Feature.none
        var r = reading
        r.kind = .clue
        r.item = String(item.prefix(Self.itemMax))
        r.feature = feature
        return (r, true, Self.reason)
    }
}
