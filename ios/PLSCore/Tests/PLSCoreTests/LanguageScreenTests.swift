import Foundation
import Testing
@testable import PLSCore

/// Runs every case of shared/test-vectors/language.json through the iPhone's language screen, built
/// from shared/constants/language-words.json (contract: shared/test-vectors/README.md).
@Suite struct LanguageScreenTests {
    struct Case: Decodable { var name: String; var input: String }
    struct File: Decodable { var schemaVersion: Int; var mustAllow: [Case]; var mustRefuse: [Case]; var knownMiss: [Case] }

    func url(_ path: String) -> URL { VectorFile.sharedDir.appendingPathComponent(path) }
    func screen() throws -> LanguageScreen { try LanguageScreen(json: Data(contentsOf: url("constants/language-words.json"))) }
    func file() throws -> File { try JSONDecoder().decode(File.self, from: Data(contentsOf: url("test-vectors/language.json"))) }

    @Test func theFileHasCasesOfEveryKind() throws {
        let f = try file()
        #expect(f.schemaVersion == 1 && f.mustAllow.count >= 18 && f.mustRefuse.count >= 9 && f.knownMiss.count >= 1)
    }

    /// Every kind of case in the file is run here: a new kind fails this test until the iPhone runs it.
    @Test func everyKindOfCaseInTheFileIsRun() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url("test-vectors/language.json"))) as? [String: Any] ?? [:]
        #expect(Set(root.keys) == ["schemaVersion", "note", "mustAllow", "mustRefuse", "knownMiss"], "\(root.keys.sorted())")
    }

    @Test func englishNotesMayGoToTheCloud() throws {
        let s = try screen()
        for c in try file().mustAllow { #expect(s.looksEnglish(c.input), "\(c.name)") }
    }

    @Test func notesInAnotherLanguageStayOnThePhone() throws {
        let s = try screen()
        for c in try file().mustRefuse { #expect(!s.looksEnglish(c.input), "\(c.name)") }
    }

    /// The cases the rule gets wrong on purpose pass as English here too, like on every platform.
    @Test func knownMissesPassAsEnglishLikeEverywhere() throws {
        let s = try screen()
        for c in try file().knownMiss { #expect(s.looksEnglish(c.input), "\(c.name)") }
    }

    /// Words made only of digits are dropped; a note with no words looks English (nothing to refuse).
    @Test func digitsAloneAreNotWords() throws {
        let s = try screen()
        #expect(s.looksEnglish("") && s.looksEnglish("14 03 2026") && s.looksEnglish("\u{0664}\u{0660}\u{0664}"))
    }
}
