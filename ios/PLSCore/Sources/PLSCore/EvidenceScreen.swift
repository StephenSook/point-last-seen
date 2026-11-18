import Foundation

/// Code pre-screen that runs before any model (rule R8). A report with a possible-evidence
/// term goes to no model on any route. Terms come from shared/constants/evidence-terms.json.
public struct EvidenceScreen: Sendable {
    let terms: [[Substring]]

    public init(terms: [String]) {
        self.terms = terms.map(Self.words).filter { !$0.isEmpty }
    }

    /// Whole words, case-insensitive; a multi-word term matches consecutive words.
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
        Substring(s.lowercased()).split(whereSeparator: { !($0.isLetter || $0.isNumber || $0 == "'") })
    }
}
