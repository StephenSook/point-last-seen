import Foundation

/// The kinds of found object a photo can show: a closed list Apple's model picks from.
public enum PhotoObjectKind: String, Codable, Sendable, CaseIterable {
    case hat, coat, shirt, pants, shoe, glove, bag, glasses, cane, walker, phone, keys, wallet, other
}

/// What Apple's model says about one photo of something found. The model never sees the family's description,
/// so it cannot bend what it sees toward it; code compares (`PhotoClue.decide`).
public struct PhotoDescription: Sendable, Equatable {
    public var showsPerson: Bool
    public var object: String
    public var color: ClothingColor
    public var kind: PhotoObjectKind

    public init(showsPerson: Bool, object: String, color: ClothingColor, kind: PhotoObjectKind) {
        self.showsPerson = showsPerson
        self.object = object
        self.color = color
        self.kind = kind
    }
}

/// Turns a photo's description into a clue report, in code. A photo that shows any part of a person is never kept.
/// The object is compared with the family's described items only (the six-field `ModelProfile`): the same kind of
/// thing in the same color, or a described item with no color, is consistent; anything else is unknown, so a clue
/// is never marked down on a guess.
public enum PhotoClue {
    public static let personMessage = "This photo shows a person, so it was not kept. Take a photo of the object only."

    public struct Clue: Sendable, Equatable {
        /// The report's words, written by code: "Photo: black baseball cap."
        public var rawText: String
        public var reading: ReportReading
        /// The family's described item it matches, as they wrote it, for the receipt.
        public var matchedPhrase: String?
    }

    public enum Outcome: Sendable, Equatable {
        case discarded(String)
        case clue(Clue)
    }

    public static func decide(_ photo: PhotoDescription, profile: ModelProfile, segmentIds: [String]) -> Outcome {
        // The words keep the whole caption, so the evidence screen sees all of it; the item is cut to the schema's 40.
        let caption = cleaned(photo.object, kind: photo.kind, max: 200)
        let object = cleaned(photo.object, kind: photo.kind, max: 40)
        if photo.showsPerson || namesAPerson(photo.object) { return .discarded(personMessage) }
        let phrase = match(photo, profile: profile)
        var reading = ReportReading.unclear(quote: object)
        reading.kind = .clue
        reading.segmentIds = segmentIds
        reading.item = object
        reading.matchesProfile = phrase == nil ? .unknown : .consistent
        return .clue(Clue(rawText: "Photo: \(caption).", reading: reading, matchedPhrase: phrase))
    }

    /// The first described item of the same kind whose color agrees, or that names no color. Whatever the rule cannot
    /// read for sure gives no match (unknown), never consistent: a phrase with a negation ("no red cap"), a word right
    /// before the item that is neither a listed color nor a style word ("teal cap", "red plaid cap"), or a caption whose
    /// own color disagrees with the color field. A color counts only in the words right before the item, so in "black
    /// hair wearing a red cap" the cap is red.
    static func match(_ photo: PhotoDescription, profile: ModelProfile) -> String? {
        let items = kindWords[photo.kind, default: []]
        guard !items.isEmpty else { return nil }
        let captionColors = Set(words(photo.object).compactMap(color))
        if !captionColors.isEmpty, !captionColors.contains(photo.color) { return nil }
        for phrase in phrases(profile) {
            let w = words(phrase)
            guard w.allSatisfy({ !negations.contains($0) }), let at = w.firstIndex(where: items.contains) else { continue }
            var modifiers: [String] = []
            var i = at - 1
            while i >= 0, !modifierStops.contains(w[i]), !allKindWords.contains(w[i]) {
                modifiers.append(w[i])
                i -= 1
            }
            guard modifiers.allSatisfy({ color($0) != nil || styleWords.contains($0) }) else { continue }
            let colors = Set(modifiers.compactMap(color))
            if colors.isEmpty || (photo.color != .unknown && colors.contains(photo.color)) { return phrase }
        }
        return nil
    }

    /// The family's described items, one per phrase, as they wrote them.
    static func phrases(_ profile: ModelProfile) -> [String] {
        let text = [profile.clothingLastWorn, profile.appearance].compactMap { $0 } + (profile.mobilityAids ?? [])
        return text.flatMap { part in
            part.replacingOccurrences(of: #"\s+(and|with)\s+"#, with: ",", options: [.regularExpression, .caseInsensitive])
                .split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "." })
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
    }

    /// True when any word of the object names a person or part of one: a plural (bodies, niños, mujeres) or a word
    /// spelled out letter by letter ("m.a.n", "W-O-M-A-N") counts. A person word inside a longer word (handbag) does not.
    static func namesAPerson(_ object: String) -> Bool {
        let tokens = words(object)
        var joined: [String] = []
        var letters = ""
        for t in tokens {
            if t.count == 1 { letters += t; continue }
            if !letters.isEmpty { joined.append(letters); letters = "" }
        }
        if !letters.isEmpty { joined.append(letters) }
        return (tokens + joined).contains { w in forms(w).contains(where: personWords.contains) }
    }

    /// A word and its singular forms: bodies -> body, mujeres -> mujer, niños -> niño.
    static func forms(_ w: String) -> [String] {
        var all = [w]
        if w.count > 4, w.hasSuffix("ies") { all.append(String(w.dropLast(3)) + "y") }
        if w.count > 3, w.hasSuffix("es") { all.append(String(w.dropLast(2))) }
        if w.count > 3, w.hasSuffix("s") { all.append(String(w.dropLast())) }
        return all
    }

    static func words(_ s: String) -> [String] {
        s.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init)
    }

    /// Lower case, letters and single spaces only (digits, and so any number, are gone), at most `max` characters cut
    /// at a word; the kind's name when nothing is left. The 40-character item is a prefix of the 200-character caption.
    static func cleaned(_ object: String, kind: PhotoObjectKind, max: Int) -> String {
        var s = words(object).joined(separator: " ")
        while s.count > max, let space = s.lastIndex(of: " ") { s = String(s[..<space]) }
        if s.count > max { s = String(s.prefix(max)) }
        return s.isEmpty ? (kind == .other ? "object" : kind.rawValue) : s
    }

    static func color(_ word: String) -> ClothingColor? {
        if let c = ClothingColor(rawValue: word), c != .unknown { return c }
        return colorNames[word]
    }

    static let colorNames: [String: ClothingColor] = [
        "navy": .blue, "grey": .gray, "charcoal": .gray, "silver": .gray, "beige": .tan, "khaki": .tan, "cream": .white,
        "ivory": .white, "maroon": .red, "burgundy": .red, "crimson": .red, "olive": .green, "violet": .purple,
        "lavender": .purple, "magenta": .pink, "gold": .yellow,
    ]

    static let kindWords: [PhotoObjectKind: Set<String>] = [
        .hat: ["hat", "hats", "cap", "caps", "beanie", "beret", "bonnet", "visor", "toque"],
        .coat: ["coat", "jacket", "windbreaker", "parka", "vest", "raincoat", "anorak", "fleece", "poncho", "overcoat"],
        .shirt: ["shirt", "blouse", "sweater", "sweatshirt", "hoodie", "cardigan", "tee", "pullover", "jersey", "turtleneck"],
        .pants: ["pants", "trousers", "jeans", "slacks", "sweatpants", "shorts", "leggings", "skirt"],
        .shoe: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "slipper", "slippers", "sandal", "sandals", "loafer", "loafers"],
        .glove: ["glove", "gloves", "mitten", "mittens"],
        .bag: ["bag", "purse", "backpack", "handbag", "tote", "satchel"],
        .glasses: ["glasses", "spectacles", "eyeglasses", "sunglasses"],
        .cane: ["cane", "stick"],
        .walker: ["walker", "rollator"],
        .phone: ["phone", "cellphone", "smartphone"],
        .keys: ["key", "keys"],
        .wallet: ["wallet"],
    ]

    static let allKindWords: Set<String> = kindWords.values.reduce(into: Set<String>()) { $0.formUnion($1) }

    /// A phrase with one of these says what the person did not have, so it never matches.
    static let negations: Set<String> = ["no", "not", "without", "never", "nor", "none", "sin", "ni", "nunca"]

    /// Where the words describing an item stop, reading back from it: articles, possessives, verbs and joining words.
    static let modifierStops: Set<String> = [
        "a", "an", "the", "her", "his", "their", "my", "our", "your", "some", "this", "that", "wearing", "wears", "wore",
        "carrying", "carries", "carried", "had", "has", "have", "was", "is", "are", "also", "or", "in", "on", "of", "plus",
        "un", "una", "el", "la", "los", "las", "con",
    ]

    /// Words before an item that say its style, not its color.
    static let styleWords: Set<String> = [
        "baseball", "knit", "knitted", "winter", "rain", "wool", "woolen", "woollen", "leather", "wooden", "wood", "metal",
        "aluminum", "folding", "quad", "running", "tennis", "hiking", "walking", "sun", "reading", "rubber", "canvas",
        "cotton", "puffy", "puffer", "hooded", "zip", "button", "long", "short", "sleeve", "sleeved", "old", "new", "worn",
        "faded", "light", "dark", "bright", "pale", "small", "large", "big", "little", "warm", "thin", "thick", "heavy",
        "wide", "brimmed", "bucket", "trucker", "golf", "ski", "snow", "slip", "lace", "laced", "velcro",
    ]

    /// Words for a person or part of one in a photo's object. Not the state words a report uses for a person
    /// ("walking", "sitting", "safe"): a walking stick is an object.
    static let personWords: Set<String> = [
        "person", "persons", "people", "human", "humans", "someone", "somebody", "man", "men", "woman", "women", "lady",
        "gentleman", "guy", "boy", "girl", "child", "children", "kid", "kids", "baby", "toddler", "teen", "hiker",
        "hikers", "searcher", "searchers", "subject", "patient", "victim", "body", "he", "she", "him", "her", "they",
        "them", "grandma", "grandpa", "grandmother", "grandfather", "mom", "mother", "dad", "father",
        "hand", "finger", "face", "arm", "leg", "foot", "feet", "head", "shoulder", "knee", "skin", "ankle", "wrist", "torso",
        "neck", "elbow", "thumb", "toe", "chest", "shin", "thigh", "fist", "eye",
        "remains", "corpse", "cadaver",
        "persona", "gente", "hombre", "mujer", "chico", "chica", "niño", "niña", "nino", "nina", "bebé", "bebe", "señor",
        "señora", "senor", "senora", "cuerpo", "cadáver", "restos", "mano", "cara", "brazo", "pierna", "pie",
    ]
}
