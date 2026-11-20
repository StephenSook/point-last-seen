import Foundation

/// Grounds a reading in its note. The rule and its word lists come from
/// shared/constants/grounding-words.json (`matching`); shared/test-vectors/grounding.json pins it on every
/// platform, and shared/engine-ts/src/ground.ts is the reference. A model can fill a field from the
/// subject's profile instead of the note ("blue" because the profile says a blue jacket): a colour, a
/// direction, footwear or a carried item the note does not support is blanked, so a report never claims
/// what nobody wrote.
///
/// Matching: the note's words are its runs of letters (Unicode letters, by code point), lowercased; two
/// words joined only by spaces or hyphens also count joined ("north-east" counts as "northeast"). A colour
/// or a direction other than unknown stays when one of its words is a word of the note; N, E, S and W
/// count only as a capital letter on its own. Footwear or carried stays when it shares a word of at least
/// `minSharedWordLength` letters, not a stopword, with the note.
public struct Grounding: Sendable {
    let colorWords: [String: [String]]
    let directionWords: [String: [String]]
    let capitalLetters: [String: String]
    let stopWords: Set<String>
    let minSharedWordLength: Int

    struct WordsFile: Decodable {
        let colorWords: [String: [String]]
        let directionWords: [String: [String]]
        let capitalLetters: [String: String]
        let stopWords: [String]
        let minSharedWordLength: Int
    }

    public init(json: Data) throws {
        let f = try JSONDecoder().decode(WordsFile.self, from: json)
        colorWords = f.colorWords
        directionWords = f.directionWords
        capitalLetters = f.capitalLetters
        stopWords = Set(f.stopWords)
        minSharedWordLength = f.minSharedWordLength
    }

    /// A copy of `reading` with each colour, direction, footwear or carried value the note does not support blanked.
    public func ground(_ reading: ReportReading, note: String) -> ReportReading {
        let runs = Self.letterRuns(note)
        let lower = runs.map { $0.word.lowercased() }
        let single = Set(lower)
        var all = single
        for k in runs.indices.dropLast() {
            let gap = runs[k].gapAfter
            if !gap.isEmpty, gap.allSatisfy({ $0 == " " || $0 == "-" }) { all.insert(lower[k] + lower[k + 1]) }
        }
        let capitals = Set(runs.map(\.word).filter { $0.utf16.count == 1 && $0 == $0.uppercased() && $0 != $0.lowercased() })

        func color(_ c: ClothingColor) -> ClothingColor {
            c == .unknown || (colorWords[c.rawValue] ?? []).contains(where: all.contains) ? c : .unknown
        }
        let d = reading.direction
        let directionKept = d == .unknown || (directionWords[d.rawValue] ?? []).contains(where: all.contains)
            || capitalLetters[d.rawValue].map(capitals.contains) == true
        func shared(_ text: String) -> Bool {
            text.isEmpty || Self.letterRuns(text).map { $0.word.lowercased() }
                .contains { $0.utf16.count >= minSharedWordLength && !stopWords.contains($0) && single.contains($0) }
        }
        var r = reading
        r.topColor = color(reading.topColor)
        r.bottomColor = color(reading.bottomColor)
        r.direction = directionKept ? d : .unknown
        r.footwear = shared(reading.footwear) ? reading.footwear : ""
        r.carried = shared(reading.carried) ? reading.carried : ""
        return r
    }

    /// Blanks every field grounding checks: used when no word list is loaded, so the read fails closed.
    public static func blanked(_ reading: ReportReading) -> ReportReading {
        var r = reading
        r.topColor = .unknown
        r.bottomColor = .unknown
        r.direction = .unknown
        r.footwear = ""
        r.carried = ""
        return r
    }

    /// Runs of Unicode letters by code point (as `\p{L}+` with the u flag), each with the text up to the next run.
    static func letterRuns(_ s: String) -> [(word: String, gapAfter: String)] {
        let scalars = Array(s.unicodeScalars)
        var runs: [(start: Int, end: Int)] = []
        var i = 0
        while i < scalars.count {
            guard isLetter(scalars[i]) else { i += 1; continue }
            var j = i
            while j < scalars.count, isLetter(scalars[j]) { j += 1 }
            runs.append((i, j))
            i = j
        }
        func text(_ a: Int, _ b: Int) -> String { String(String.UnicodeScalarView(scalars[a..<b])) }
        return runs.indices.map { k in
            (text(runs[k].start, runs[k].end), k + 1 < runs.count ? text(runs[k].end, runs[k + 1].start) : "")
        }
    }

    static func isLetter(_ u: Unicode.Scalar) -> Bool {
        switch u.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter: return true
        default: return false
        }
    }
}
