import Foundation
import PLSCore
import Testing
@testable import PLS

@Suite struct ToolsTests {
    @Test func segmentHereSaysWhenThereIsNoFix() async throws {
        #expect(try await SegmentAtTool(positionSegmentId: nil).call(arguments: .init(note: "")) == "No GPS fix. Do not guess a segment.")
        #expect(try await SegmentAtTool(positionSegmentId: "AC").call(arguments: .init(note: "")) == "The team is in segment AC.")
    }

    @Test func teamAssignmentListsTheAssignedIds() async throws {
        #expect(try await TeamAssignmentTool(assignedSegmentIds: ["AB", "AD"]).call(arguments: .init(note: "")) == "Assigned segments: AB, AD.")
        #expect(try await TeamAssignmentTool(assignedSegmentIds: []).call(arguments: .init(note: "")) == "No assignment yet.")
    }

    @Test func subjectDescriptionReturnsOnlyTheAppearanceText() async throws {
        let shared: JSONValue = .object(["clothingLastWorn": .string("blue robe"), "dementiaType": .string("lewy_body"), "flags": .object(["seizures": .bool(true)])])
        let out = try await SubjectProfileTool(profile: ModelProfile(shared: shared)).call(arguments: .init(note: ""))
        #expect(out == "Clothing last worn: blue robe.")
    }
}
