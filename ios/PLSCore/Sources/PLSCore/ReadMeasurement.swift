import Foundation

/// The three timings of one report, written to the device's own measurements document
/// (spec section 7), because the event itself is never updated.
public struct ReadMeasurement: Codable, Sendable, Equatable {
    public var submittedAtMs: Double
    public var readDoneAtMs: Double
    public var redrawnAtMs: Double

    public init(submittedAtMs: Double, readDoneAtMs: Double, redrawnAtMs: Double) {
        self.submittedAtMs = submittedAtMs
        self.readDoneAtMs = readDoneAtMs
        self.redrawnAtMs = redrawnAtMs
    }

    /// Time from Send to a validated reading.
    public var readMs: Double { readDoneAtMs - submittedAtMs }
    /// Time from the reading to the redrawn map.
    public var redrawMs: Double { redrawnAtMs - readDoneAtMs }

    /// `incidents/{incidentId}/teams/{teamId}/devices/{deviceId}/measurements/{eventId}`; the
    /// device id is the auth uid, and only that uid may write here.
    public static func path(incidentId: String, teamId: String, deviceId: String, eventId: String) -> String {
        "incidents/\(incidentId)/teams/\(teamId)/devices/\(deviceId)/measurements/\(eventId)"
    }
}
