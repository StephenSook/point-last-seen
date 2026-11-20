import Foundation
import PLSCore

/// Shared constants copied into the app bundle from shared/constants at build time.
/// The incident doc and the pack carry the live engine numbers; these serve the drill pack
/// and the evidence pre-screen, which must work with no network.
enum BundledConstants {
    enum Missing: Error { case file(String) }

    static func data(_ name: String) throws -> Data {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else { throw Missing.file("\(name).json") }
        return try Data(contentsOf: url)
    }

    static func evidenceScreen() throws -> EvidenceScreen {
        try EvidenceScreen(json: data("evidence-terms"))
    }

    private struct ParamsFile: Decodable { let params: EngineParams }

    static func engineParams() throws -> EngineParams {
        try JSONDecoder().decode(ParamsFile.self, from: data("engine-params")).params
    }

    /// The approach card's fixed copy, ordering and footer.
    static func approachNotes() throws -> ApproachNotes {
        try ApproachNotes(json: data("approach-notes"))
    }

    /// Each tracking aid's search-card line (cards only, never sent to a model).
    static func trackingAids() throws -> TrackingAidCopy {
        try TrackingAidCopy(json: data("tracking-aids"))
    }

    /// The urgency chip's threshold and its CDC source line.
    static func urgencyRule() throws -> UrgencyRule {
        try UrgencyRule(json: data("urgency"))
    }
}

