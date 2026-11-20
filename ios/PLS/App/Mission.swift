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
    /// The version of the plan the assignment came from; nil before command approves one. Only a
    /// newer plan replaces it.
    var planVersion: Int? = nil
    /// The session the mission was read in. It is installed, opened and spoken only while that
    /// session is the current one; nil (no session) never is.
    var owner: AccountSession? = nil
    /// The user of that session.
    var ownerUid: String? { owner?.uid }
    /// Events already folded into the pack's prior; the posterior leaves them out.
    var priorInputEventIds: [String] = []
    /// The incident's `conditions` typed at command (temperature, wet); nil when not set.
    var conditions: IncidentConditions? = nil
}
