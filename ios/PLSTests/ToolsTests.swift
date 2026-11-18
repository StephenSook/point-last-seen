import Foundation
import PLSCore
import Testing
@testable import PLS

/// The app's tools must send exactly the Core text that `cloudPromptHoldsOnlyNamedFields` pins.
@Suite struct ToolsTests {
    @Test func segmentHereSendsTheCoreText() async throws {
        let tool = SegmentAtTool(positionSegmentId: "AC")
        #expect(tool.name == ToolText.segmentHereName && tool.description == ToolText.segmentHereDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == ToolText.segmentHere("AC"))
        #expect(try await SegmentAtTool(positionSegmentId: nil).call(arguments: .init(note: "")) == ToolText.segmentHere(nil))
    }

    @Test func teamAssignmentSendsTheCoreText() async throws {
        let tool = TeamAssignmentTool(assignedSegmentIds: ["AB", "AD"])
        #expect(tool.name == ToolText.teamAssignmentName && tool.description == ToolText.teamAssignmentDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == ToolText.teamAssignment(["AB", "AD"]))
    }

    @Test func subjectDescriptionSendsOnlyTheAppearanceText() async throws {
        let shared: JSONValue = .object(["clothingLastWorn": .string("blue robe"), "dementiaType": .string("lewy_body"), "flags": .object(["seizures": .bool(true)])])
        let tool = SubjectProfileTool(profile: ModelProfile(shared: shared))
        #expect(tool.name == ToolText.subjectDescriptionName && tool.description == ToolText.subjectDescriptionDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == "Clothing last worn: blue robe.")
    }

    @Test func theInstructionsAreTheCoreText() {
        #expect(ReportPrompt.guidedText == PromptText.guided)
        #expect(ReportPrompt.permissiveText == PromptText.permissive)
    }
}
