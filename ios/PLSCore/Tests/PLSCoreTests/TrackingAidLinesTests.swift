import Foundation
import Testing
@testable import PLSCore

/// The search card's tracking-aid lines, read from shared/constants/tracking-aids.json the same way
/// the engine's trackingAidLines does: one line per aid the family named, in the file's order (an
/// id this build does not know is skipped), then the family's note; the "none" line when the family
/// said there are none; nothing when the family has not said.
@Suite struct TrackingAidLinesTests {
    func copy() throws -> TrackingAidCopy {
        try TrackingAidCopy(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/tracking-aids.json")))
    }

    @Test func theFileHasEveryAidWithItsLineAndTheNoneLine() throws {
        let c = try copy()
        #expect(c.aids.map(\.id) == ["project_lifesaver", "medicalert_id", "gps_tracker", "phone_location"])
        #expect(c.aids.allSatisfy { !$0.line.isEmpty } && !c.noneLine.isEmpty)
    }

    @Test func linesFollowTheFileOrderAndSkipUnknownIdsThenTheNote() throws {
        let c = try copy()
        let lines = ApproachCard.trackingAidLines(TrackingAids(aids: ["phone_location", "no_such_aid", "project_lifesaver"],
                                                               note: "  Tracker is in his left shoe.  "), copy: c)
        #expect(lines == [c.aids[0].line, c.aids[3].line, "Tracker is in his left shoe."])
    }

    @Test func noAidsAndNoNoteIsTheNoneLineAndAbsentIsNothing() throws {
        let c = try copy()
        #expect(ApproachCard.trackingAidLines(TrackingAids(aids: [], note: " "), copy: c) == [c.noneLine])
        #expect(ApproachCard.trackingAidLines(TrackingAids(aids: ["no_such_aid"], note: ""), copy: c) == [c.noneLine])
        #expect(ApproachCard.trackingAidLines(nil, copy: c).isEmpty)
        #expect(ApproachCard.trackingAidLines(TrackingAids(aids: [], note: "Only a note."), copy: c) == ["Only a note."])
    }

    @Test func theCardCarriesTheLines() throws {
        let notes = try ApproachNotes(json: Data(contentsOf: VectorFile.sharedDir.appendingPathComponent("constants/approach-notes.json")))
        guard case var .object(o) = sharedProfileJSON(ids: []) else { Issue.record("no profile"); return }
        o["trackingAids"] = .object(["aids": .array([.string("gps_tracker")]), "note": .string("")])
        let profile = try JSONValue.object(o).decode(SharedProfile.self)
        let c = try copy()
        #expect(ApproachCard.build(profile: profile, notes: notes, aids: c).aids == [c.aids[2].line])
        #expect(ApproachCard.build(profile: profile, notes: notes).aids.isEmpty)
    }
}
