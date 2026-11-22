import Crypto
import Foundation
import Testing
@testable import PLSCore

/// The eval's answer key, docs/evidence/eval/pls-drill-reports-v1.json, is pinned by its SHA-256, so a run always names
/// the exact key it scored against and the key is never edited after a run. A person writes it before any model run;
/// ios/scripts/eval_key_kit.py convert turns the filled sheet into this file and prints the hash to pin here.
@Suite struct EvalKeyPinTests {
    /// The SHA-256 of the person-written key; nil until that key is committed.
    static let pinnedSHA256: String? = nil

    static var keyURL: URL {
        VectorFile.sharedDir.deletingLastPathComponent().appendingPathComponent("docs/evidence/eval/pls-drill-reports-v1.json")
    }

    /// With a pin, the key is exactly the pinned file and says a person wrote it for this grid. Without one, there is no
    /// key file: a key added without a pin fails here, as does a pin with no key.
    @Test func theAnswerKeyIsThePinnedFile() throws {
        let exists = FileManager.default.fileExists(atPath: Self.keyURL.path)
        guard let pin = Self.pinnedSHA256 else {
            #expect(!exists, "a key file with no pinned SHA-256: set EvalKeyPinTests.pinnedSHA256")
            return
        }
        let data = try Data(contentsOf: Self.keyURL)
        #expect(hex(SHA256.hash(data: data)) == pin)
        let key = try JSONDecoder().decode(EvalAnswerKey.self, from: data)
        #expect(key.answerKey == "pls-drill-reports-v1" && key.writtenBy == "person" && key.grid == "piedmont-park-dev")
        #expect(!key.rows.isEmpty && key.rows.allSatisfy { $0.segments.count <= 2 })
    }
}
