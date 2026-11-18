import Foundation
import PLSCore

/// What a loaded team pack gives the phone. Built by the pack loader (Task 12); until a pack is
/// loaded the app shows "No pack loaded" and reads nothing.
struct Mission: Sendable {
    var incidentId: String
    var mode: String
    var teamId: String
    var priorVersion: Int
    var grid: [GridSegment]
    var prior: [SegmentPrior]
    var assignedSegmentIds: [String]
    var params: EngineParams
    var profile: ModelProfile
    var visualDetectionRangeM: Double?
    var rdBasis: RdBasis
}
