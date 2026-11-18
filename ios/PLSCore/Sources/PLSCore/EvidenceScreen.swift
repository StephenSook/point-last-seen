import Foundation

/// Code pre-screen that runs before any model (rule R8). A report with a possible-evidence
/// term goes to no model on any route. Terms come from shared/constants/evidence-terms.json.
public struct EvidenceScreen: Sendable {
    let terms: [[Substring]]

    public init(terms: [String]) {
        self.terms = terms.map(Self.words).filter { !$0.isEmpty }
    }

    /// Whole words, case-insensitive; a multi-word term matches consecutive words. The screen
    /// fails closed: apostrophes split words (so "blood's" and "'blood'" match "blood"), and
    /// accents and full-width letters are folded before comparing.
    public func isPossibleEvidence(_ text: String) -> Bool {
        let words = Self.words(text)
        guard !words.isEmpty else { return false }
        return terms.contains { term in
            guard term.count <= words.count else { return false }
            return (0...(words.count - term.count)).contains { start in
                words[start..<(start + term.count)].elementsEqual(term)
            }
        }
    }

    static func words(_ s: String) -> [Substring] {
        Substring(fold(s)).split(whereSeparator: { !($0.isLetter || $0.isNumber) })
    }

    /// Compatibility decomposition (NFKD), combining marks removed, then lowercased.
    static func fold(_ s: String) -> String {
        var scalars = String.UnicodeScalarView()
        for scalar in s.decomposedStringWithCompatibilityMapping.unicodeScalars
        where scalar.properties.generalCategory != .nonspacingMark {
            scalars.append(scalar)
        }
        return String(scalars).lowercased()
    }
}
