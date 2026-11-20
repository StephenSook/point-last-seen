import CryptoKit
import Foundation
import PLSCore
import Testing
@testable import PLS

@MainActor
@Suite struct EvalPromptTests {
    /// The eval's result file names the prompt Apple's model was given: the on-device instructions for
    /// the eval's reads (no position fix, the team's assignment), not the cloud prompt.
    @Test func theEvalRecordsTheOnDevicePromptsHash() throws {
        let mission = Mission(incidentId: "I1", mode: "drill", teamId: "T1", priorVersion: 1, grid: [], prior: [],
                              assignedSegmentIds: ["AC", "AD"], params: try BundledConstants.engineParams(),
                              profile: ModelProfile(shared: .null), sharedProfile: nil, visualDetectionRangeM: nil, rdBasis: .openTarget,
                              assignment: Assignment(teamId: "T1", segmentIds: ["AC", "AD"], taskText: "Walk the creek bank.", reason: "r"))
        let sent = PromptText.onDeviceGuided(positionSegmentId: nil, assignedSegmentIds: ["AC", "AD"])
        #expect(EvalView.promptSha256(mission) == Self.sha(sent))
        #expect(EvalView.promptSha256(mission) != Self.sha(PromptText.guided))
        let situation = AppModel.evalSituation(mission, arm: .onDevice)
        #expect(situation.positionSegmentId == nil && situation.assignedSegmentIds == ["AC", "AD"] && !situation.networkOnline)
    }

    static func sha(_ text: String) -> String { Data(SHA256.hash(data: Data(text.utf8))).map { String(format: "%02x", $0) }.joined() }
}
