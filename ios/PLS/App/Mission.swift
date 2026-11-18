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
    /// `profile/shared` from the pack, for the approach card; nil when command has not shared one.
    var sharedProfile: SharedProfile?
    var visualDetectionRangeM: Double?
    var rdBasis: RdBasis
    /// The team's assignment in the latest approved plan: segments and command's approved task
    /// text. Spoken when it changes; nil until a plan is approved.
    var assignment: Assignment? = nil
    /// Events already folded into the pack's prior; the posterior leaves them out.
    var priorInputEventIds: [String] = []
}
