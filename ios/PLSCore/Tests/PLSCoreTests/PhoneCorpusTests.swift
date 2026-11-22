import Crypto
import Foundation
import Testing
@testable import PLSCore

/// shared/test-vectors/phone-numbers-corpus.json: every shared case's input and fixed-seed notes, each with the output
/// the web rule gives. The iPhone rule must give the same output for every one, code point for code point, except a
/// row whose input is a shared case pending on the iPhone and not the web (a gap the web has closed), which must still
/// differ.
@Suite struct PhoneCorpusTests {
    struct Row: Decodable { var input: String; var output: String }
    struct Corpus: Decodable { var replacement: String; var rows: [Row] }

    /// The corpus this port was checked against. A new corpus changes the hash, so it is checked again on purpose.
    static let pinnedSHA256 = "752069060478c882eb1acb8196cd0b0bd57832acf3635cf5175915d77af4d65f"

    @Test func everyCorpusNoteGivesTheWebRulesOutput() throws {
        let data = try Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("test-vectors/phone-numbers-corpus.json"))
        #expect(hex(SHA256.hash(data: data)) == Self.pinnedSHA256)
        let corpus = try JSONDecoder().decode(Corpus.self, from: data)
        #expect(corpus.replacement == PhoneNumbers.replacement && corpus.rows.count == 9_130)
        let result = Self.compare(corpus.rows, pending: Self.pendingInputs(try PhoneNumberVectorTests().file()))
        #expect(result.differing.isEmpty, "\(result.differing.count) rows differ; first: \(result.differing.prefix(3).map(\.input))")
        #expect(result.unpend.isEmpty, "un-pend \(result.unpend.joined(separator: ", "))")
    }

    /// A gap pending on the web too is one the web's output also has, so its row is compared like any other; only a
    /// case pending on the iPhone and not the web is left out of the comparison.
    @Test func aGapPendingOnTheWebTooIsComparedLikeAnyRow() {
        let f = PhoneNumberVectorTests.File(schemaVersion: 1, replacement: nil, mustRemove: [], mustKeep: [], exact: [
            .init(name: "everywhere", input: "a", output: "b", pendingOn: ["android", "ios", "web"]),
            .init(name: "phones_only", input: "c", output: "d", pendingOn: ["android", "ios"]),
            .init(name: "android_only", input: "e", output: "f", pendingOn: ["android"]),
        ])
        #expect(Self.pendingInputs(f) == ["c": "phones_only"])
    }

    /// The rows that differ from the web's output, and the pending cases whose rows already match it (once each). A row
    /// whose input is a pending case's input is not compared for equality: it must still differ.
    static func compare(_ rows: [Row], pending: [String: String]) -> (differing: [Row], unpend: [String]) {
        var differing: [Row] = []
        var unpend: [String] = []
        for row in rows {
            let same = Array(PhoneNumbers.scrub(row.input).unicodeScalars) == Array(row.output.unicodeScalars)
            if let name = pending[row.input] {
                if same && !unpend.contains(name) { unpend.append(name) }
            } else if !same {
                differing.append(row)
            }
        }
        return (differing, unpend)
    }

    /// The input of every shared case (mustRemove, mustKeep or exact) pending on the iPhone and not on the web, with
    /// its case's name. A case pending on the web too is a gap the web's output has as well, so its row stays compared.
    static func pendingInputs(_ f: PhoneNumberVectorTests.File) -> [String: String] {
        let pending = { (on: [String]?) in !PhoneNumberVectorTests.runsHere(on) && !(on ?? []).contains("web") }
        let cases = f.mustRemove.filter { pending($0.pendingOn) }.map { ($0.input, $0.name) }
            + f.mustKeep.filter { pending($0.pendingOn) }.map { ($0.input, $0.name) }
            + (f.exact ?? []).filter { pending($0.pendingOn) }.map { ($0.input, $0.name) }
        return Dictionary(cases, uniquingKeysWith: { first, _ in first })
    }

    /// A row whose input is a shared case pending on the iPhone and not the web is a gap only the iPhone has, so it must
    /// still differ from the web's output; one that matches names its case: "un-pend <name>". Every other row is still
    /// compared.
    @Test func aPendingCaseRowThatMatchesTheWebMustBeUnpended() {
        let matching = Row(input: "Call 404 555 0100 now", output: PhoneNumbers.scrub("Call 404 555 0100 now"))
        let gap = Row(input: "A planted gap", output: "not what this phone writes")
        let other = Row(input: "Another note", output: "not what this phone writes")
        let pending = ["Call 404 555 0100 now": "planted_fixed", "A planted gap": "planted_gap"]
        let result = Self.compare([matching, gap, other], pending: pending)
        #expect(result.unpend == ["planted_fixed"])
        #expect(result.differing.map(\.input) == ["Another note"])
    }
}
