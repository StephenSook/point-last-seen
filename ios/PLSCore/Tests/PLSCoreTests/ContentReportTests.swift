import Foundation
import Testing
@testable import PLSCore

/// A member's "Report a problem" document, checked against shared/schemas/content-report.schema.json and the create
/// rule's limits.
@Suite struct ContentReportTests {
    func schema() throws -> [String: JSONValue] {
        guard case let .object(o) = try VectorFile.json("schemas/content-report.schema.json") else {
            throw VectorInputError(description: "schema is not an object")
        }
        return o
    }

    func strings(_ value: JSONValue?) -> Set<String> {
        guard case let .array(items)? = value else { return [] }
        return Set(items.compactMap { if case let .string(s) = $0 { s } else { nil } })
    }

    func properties() throws -> [String: JSONValue] {
        guard case let .object(p)? = try schema()["properties"] else { throw VectorInputError(description: "no properties") }
        return p
    }

    func enumValues(_ name: String) throws -> Set<String> {
        guard case let .object(p)? = try properties()[name] else { throw VectorInputError(description: "no \(name)") }
        return strings(p["enum"])
    }

    func report(_ target: ContentReport.Target = .task, _ targetId: String? = "0001", note: String? = "Wrong road name") throws
        -> ContentReport {
        try #require(ContentReport(authorUid: "uid-1", role: .searcher, target: target, targetId: targetId,
                                   reason: .wrongOrMisleading, note: note))
    }

    @Test func everyFieldAndValueIsTheSchemas() throws {
        let fields = try report().fields
        // The phone writes every property but the server's time, which the writer adds as the server timestamp.
        #expect(Set(fields.keys).union(["createdAt"]) == Set(try properties().keys))
        #expect(strings(try schema()["required"]).subtracting(fields.keys) == ["createdAt"])
        #expect(Set(ContentReport.Role.allCases.map(\.rawValue)) == (try enumValues("role")))
        #expect(Set(ContentReport.Target.allCases.map(\.rawValue)) == (try enumValues("target")))
        #expect(Set(ContentReport.Reason.allCases.map(\.rawValue)) == (try enumValues("reason")))
        #expect(fields["targetId"] == .string("0001") && fields["reason"] == .string("wrong_or_misleading"))
        #expect(fields["role"] == .string("searcher") && fields["authorUid"] == .string("uid-1"))
    }

    @Test func noNoteMeansNoNoteField() throws {
        let fields = try report(.familyDescription, nil, note: "  \n ").fields
        #expect(fields["note"] == nil && fields["createdAt"] == nil)
        #expect(fields["targetId"] == .null && fields["target"] == .string("family_description"))
    }

    @Test func theNoteLosesPhoneNumbers() throws {
        let note = try #require(ContentReport.cleanNote("Call 404-555-0123 about the trailhead"))
        #expect(!note.contains("404") && note.contains(PhoneNumbers.replacement))
    }

    /// The rule counts the note in code points (RE2 `.`), so the cap is 500 Unicode scalars, cut between whole
    /// characters, after the phone numbers are removed and the ends trimmed.
    @Test func theNoteIsCappedAt500CodePointsBetweenWholeCharacters() throws {
        #expect(ContentReport.cleanNote(String(repeating: "a", count: 600))?.unicodeScalars.count == 500)
        let family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"   // one character, five scalars
        let long = String(repeating: "ab" + family, count: 100)       // 700 scalars
        let note = try #require(ContentReport.cleanNote(long))
        // 71 whole "ab" + family units are 497 scalars; "a" and "b" make 499; the next family would pass 500.
        #expect(note.unicodeScalars.count == 499 && note.hasSuffix("ab") && long.hasPrefix(note))
        #expect(ContentReport.cleanNote("   ") == nil)
        #expect(ContentReport.cleanNote("  edge  ") == "edge")
    }

    @Test func theTargetIdFitsTheTarget() throws {
        let make = { (t: ContentReport.Target, id: String?) in
            ContentReport(authorUid: "uid-1", role: .searcher, target: t, targetId: id, reason: .other, note: nil)
        }
        #expect(make(.familyDescription, nil) != nil && make(.familyDescription, "0001") == nil)
        #expect(make(.task, "0001") != nil && make(.task, nil) == nil && make(.task, "bad id!") == nil)
        #expect(make(.task, String(repeating: "a", count: 65)) == nil)
        #expect(make(.event, String(repeating: "a1", count: 16)) != nil && make(.event, "0001") == nil)
        #expect(ContentReport(authorUid: "", role: .searcher, target: .task, targetId: "0001", reason: .other, note: nil) == nil)
    }

    @Test func aReportIdIs32LowercaseHexAndNew() {
        let a = ContentReport.newReportId(), b = ContentReport.newReportId()
        #expect(a.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil && a != b)
    }

    @Test func aTaskIsNamedByItsPlanDocument() {
        #expect(ContentReport.taskId(planVersion: 1) == "0001" && ContentReport.taskId(planVersion: 12) == "0012")
    }

    /// The reasons in the words the command post shows them with.
    @Test func theReasonsReadAsOnTheCommandPost() {
        #expect(ContentReport.Reason.allCases.map(\.words) == ["Abusive or offensive", "Personal information that should not be shared",
                                                             "Wrong or misleading", "Other"])
    }
}
