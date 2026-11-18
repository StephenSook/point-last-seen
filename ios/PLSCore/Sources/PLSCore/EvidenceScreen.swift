import Foundation

/// Code pre-screen that runs before any model (rule R8). A report with a possible-evidence
/// term goes to no model on any route. Terms come from shared/constants/evidence-terms.json.
///
/// Matching (pinned by the shared vectors): NFKD-normalize, drop combining marks (M*),
/// lowercase, then split on any code point that is not a letter or digit (L*, N*). A term,
/// processed the same way, matches when its words appear consecutively. Fails closed:
/// apostrophes split words, so "blood's" and "'blood'" match "blood".
public struct EvidenceScreen: Sendable {
    let terms: [[String]]

    public init(terms: [String]) {
        self.terms = terms.map(Self.words).filter { !$0.isEmpty }
    }

    struct TermsFile: Decodable { let terms: [String] }

    /// Reads the shared `evidence-terms.json` (`{ schemaVersion, matching, source, terms }`).
    public init(json: Data) throws {
        self.init(terms: try JSONDecoder().decode(TermsFile.self, from: json).terms)
    }

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

    static func words(_ s: String) -> [String] {
        var marksDropped = String.UnicodeScalarView()
        for scalar in s.decomposedStringWithCompatibilityMapping.unicodeScalars where !isMark(scalar) {
            marksDropped.append(scalar)
        }
        var words: [String] = []
        var current = String.UnicodeScalarView()
        for scalar in String(marksDropped).lowercased().unicodeScalars {
            if isLetterOrDigit(scalar) {
                current.append(scalar)
            } else if !current.isEmpty {
                words.append(String(current)); current = String.UnicodeScalarView()
            }
        }
        if !current.isEmpty { words.append(String(current)) }
        return words
    }

    static func isMark(_ s: Unicode.Scalar) -> Bool {
        switch s.properties.generalCategory {
        case .nonspacingMark, .spacingMark, .enclosingMark: return true
        default: return false
        }
    }

    static func isLetterOrDigit(_ s: Unicode.Scalar) -> Bool {
        switch s.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber: return true
        default: return false
        }
    }
}
