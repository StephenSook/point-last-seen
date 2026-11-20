import Foundation

/// The language screen, run before a note may go to the cloud read. The rule and its word lists come
/// from shared/constants/language-words.json (`matching`); the shared vectors pin it on every
/// platform. A note that does not look English stays on this phone: the on-device read and the pick
/// list still work, the cloud read does not run.
///
/// Matching: fold and split the note as the evidence screen does (NFKD, drop combining marks,
/// lowercase, split on anything that is not a letter or digit) and drop words made only of digits. A
/// word is non-Latin when it holds anything outside a to z and 0 to 9. With E the English words and F
/// the foreign words plus the non-Latin ones, the note does not look English when more than half its
/// words are non-Latin, or when F is at least `minForeign` and more than `foreignOverEnglish` times E.
/// An English note quoting Spanish still passes.
public struct LanguageScreen: Sendable {
    let english: Set<String>
    let foreign: Set<String>
    let minForeign: Int
    let foreignOverEnglish: Double

    public init(english: Set<String>, foreign: Set<String>, minForeign: Int, foreignOverEnglish: Double) {
        self.english = english
        self.foreign = foreign
        self.minForeign = minForeign
        self.foreignOverEnglish = foreignOverEnglish
    }

    struct WordsFile: Decodable {
        let english: [String]
        let foreign: [String]
        let minForeign: Int
        let foreignOverEnglish: Double
    }

    /// Reads the shared `language-words.json`.
    public init(json: Data) throws {
        let f = try JSONDecoder().decode(WordsFile.self, from: json)
        self.init(english: Set(f.english), foreign: Set(f.foreign), minForeign: f.minForeign, foreignOverEnglish: f.foreignOverEnglish)
    }

    public func looksEnglish(_ text: String) -> Bool {
        let words = EvidenceScreen.words(text).filter { !$0.unicodeScalars.allSatisfy(Self.isNumber) }
        guard !words.isEmpty else { return true }
        let nonLatin = words.filter { $0.unicodeScalars.contains { !Self.isLatin($0) } }.count
        if nonLatin * 2 > words.count { return false }
        let englishCount = words.filter(english.contains).count
        let foreignCount = words.filter(foreign.contains).count + nonLatin
        return !(foreignCount >= minForeign && Double(foreignCount) > foreignOverEnglish * Double(englishCount))
    }

    static func isNumber(_ s: Unicode.Scalar) -> Bool {
        switch s.properties.generalCategory {
        case .decimalNumber, .letterNumber, .otherNumber: return true
        default: return false
        }
    }

    static func isLatin(_ s: Unicode.Scalar) -> Bool { ("a"..."z").contains(s) || ("0"..."9").contains(s) }
}
