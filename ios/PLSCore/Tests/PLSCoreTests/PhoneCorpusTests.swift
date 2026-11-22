import Crypto
import Foundation
import Testing
@testable import PLSCore

/// shared/test-vectors/phone-numbers-corpus.json: every shared case's input and fixed-seed notes, each with the output
/// the web rule gives. The iPhone rule must give the same output for every one, code point for code point.
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
        let differing = corpus.rows.filter { Array(PhoneNumbers.scrub($0.input).unicodeScalars) != Array($0.output.unicodeScalars) }
        #expect(differing.isEmpty, "\(differing.count) rows differ; first: \(differing.prefix(3).map(\.input))")
    }
}
