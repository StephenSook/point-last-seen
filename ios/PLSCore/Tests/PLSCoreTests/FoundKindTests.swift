import Foundation
import Testing
@testable import PLSCore

/// Runs every case of shared/test-vectors/found-kind.json through the iPhone's found-kind check (reference:
/// shared/engine-ts/src/found.ts), and mirrors the engine test's generated checks: a note that also says the
/// person was found, names them, or puts a name-like word where a name would stand is never corrected.
@Suite struct FoundKindTests {
    struct Case: Decodable {
        var name: String; var note: String; var names: [String]; var kindIn: ReportKind; var kindOut: ReportKind
        var item: String?; var feature: Feature?; var corrected: Bool; var parserKind: ReportKind
    }
    struct File: Decodable { var schemaVersion: Int; var note: String; var reason: String; var cases: [Case] }

    static func url(_ path: String) -> URL { VectorFile.sharedDir.appendingPathComponent(path) }
    static func rule() throws -> FoundKind { FoundKind(grounding: try GroundingTests.grounding()) }
    func file() throws -> File { try JSONDecoder().decode(File.self, from: Data(contentsOf: Self.url("test-vectors/found-kind.json"))) }
    static func blank(_ kind: ReportKind) -> ReportReading { var r = ReportReading.unclear(); r.kind = kind; return r }

    @Test func theFileHasCorrectedAndUnchangedCasesAndTheReason() throws {
        let f = try file()
        #expect(f.schemaVersion == 1 && f.cases.count >= 53)
        #expect(f.cases.contains { $0.corrected } && f.cases.contains { !$0.corrected && $0.kindIn == .found })
        #expect(f.reason == FoundKind.reason)
    }

    /// Every key of the file and of its cases is read here: a new one fails this test until the iPhone runs it.
    @Test func everyKeyInTheFileIsRead() throws {
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.url("test-vectors/found-kind.json"))) as? [String: Any] ?? [:]
        #expect(Set(root.keys) == ["schemaVersion", "note", "reason", "cases"], "\(root.keys.sorted())")
        let keys = Set(((root["cases"] as? [[String: Any]]) ?? []).flatMap(\.keys))
        #expect(keys.isSubset(of: ["name", "note", "names", "kindIn", "kindOut", "item", "feature", "corrected", "parserKind"]), "\(keys.sorted())")
    }

    @Test func everyCaseGivesItsKindItemAndFeature() throws {
        let rule = try Self.rule()
        for c in try file().cases {
            let reading = Self.blank(c.kindIn)
            let out = rule.correct(reading, note: c.note, names: c.names)
            #expect(out.reading.kind == c.kindOut, "\(c.name)")
            #expect(out.corrected == c.corrected, "\(c.name)")
            #expect(out.reason == (c.corrected ? FoundKind.reason : nil), "\(c.name)")
            if c.corrected {
                #expect(out.reading.item == c.item && out.reading.feature == c.feature, "\(c.name): \(out.reading.item) \(out.reading.feature)")
            } else {
                #expect(out.reading == reading, "\(c.name)")
            }
        }
    }

    /// The vectors' parserKind is what this phone's rules parser gives the note, checked rather than assumed.
    @Test func eachCasesParserKindIsWhatThisPhonesParserGives() throws {
        for c in try file().cases {
            let kind = ReportParser.parse(c.note, context: ParseContext(knownSegmentIds: ["BO", "BP"])).kind
            #expect(kind == c.parserKind, "\(c.name): parser gives \(kind.rawValue)")
        }
    }

    /// A person-found note read as a clue is the one wrong answer that must never happen.
    @Test func aNoteThatAlsoSaysThePersonWasFoundIsNeverCorrected() throws {
        let rule = try Self.rule()
        let objects = ["a coat", "a jacket", "the walker", "a shoe", "a cane", "some keys", "the glasses", "a backpack", "her coat", "his hat"]
        let people = [
            "she is sitting by the creek", "he is talking to us", "they are alive", "she's conscious", "the woman is hurt",
            "ambulance on the way", "she is ok", "he is okay", "she is fine", "he is awake", "she is responsive", "he is injured",
            "EMS on scene", "medic with him", "called 911 for her", "the man is cold but breathing", "a lady is with us",
            "he is dead", "she was located", "the subject is safe", "taking him to the hospital", "paramedics have them",
            "grandma nearby", "found mom too", "found Bea by the bench", "grandpa is with the team", "her husband is here",
            "my dad is sitting down", "nana answered", "found Bea", "and then found grandpa",
        ]
        var count = 0
        for o in objects { for p in people { for note in ["Found \(o), \(p)", "Found \(o) and \(p)", "Found \(o). \(p)"] {
            let out = rule.correct(Self.blank(.found), note: note, names: [])
            #expect(!out.corrected && out.reading.kind == .found, "\(note)")
            count += 1
        } } }
        #expect(count == 930)
    }

    @Test func anObjectBesideAFamilyWordANameOrASecondFindIsNeverCorrected() throws {
        let rule = try Self.rule()
        let objects = ["a coat", "the walker", "a shoe", "some keys", "her coat", "his hat", "a blue jacket"]
        let family = ["grandma", "grandpa", "grandmother", "grandfather", "granny", "nana", "papa", "mom", "mother", "dad", "father",
                      "wife", "husband", "partner", "son", "daughter", "brother", "sister", "aunt", "uncle", "friend", "neighbor", "someone"]
        let names = ["Bea", "bea", "Arthur", "Rosa", "Mr. Kim", "Art", "Lee"]
        let people = family + names + ["him", "her", "them", "the man", "the woman", "the person", "the patient", "the subject"]
        func shapes(_ o: String, _ p: String) -> [String] {
            ["Found \(o) and \(p) nearby", "Found \(o). Found \(p) too", "Found \(o) near \(p)",
             "Found \(o), \(p) is here", "found \(o), then found \(p)", "Found \(o) by the creek. \(p) by the bench"]
        }
        var count = 0
        for o in objects { for p in people { for note in shapes(o, p) { for profile in [[], ["Arthur Lee"]] {
            #expect(!rule.correct(Self.blank(.found), note: note, names: profile).corrected, "\(note)")
            count += 1
        } } } }
        #expect(count > 2000)
    }

    @Test func aNameLikeWordWhereANameWouldStandIsNeverCorrected() throws {
        let rule = try Self.rule()
        let nameLike = ["brown", "gray", "grey", "black", "white", "green", "red", "tan", "long", "short", "brook", "river", "hill",
                        "field", "woods", "forest", "wall", "bush", "shore", "post", "rock", "lake", "rose", "ivy", "hope", "rocky", "dale", "glen", "lily"]
        for n in nameLike {
            for w in [n, n.prefix(1).uppercased() + n.dropFirst()] {
                for note in ["Found a coat near \(w)", "found a hat. \(w) nearby", "Found a shoe, \(w) is here", "Found a glove with \(w)", "found a cane by \(w)"] {
                    #expect(!rule.correct(Self.blank(.found), note: note, names: []).corrected, "\(note)")
                }
            }
        }
    }

    @Test func noWordThatCouldNameThePersonIsAnObjectNoteWord() throws {
        let rule = try Self.rule()
        for w in FoundKind.personWords { #expect(!rule.objectNoteWords.contains(w), "\(w)") }
    }
}
