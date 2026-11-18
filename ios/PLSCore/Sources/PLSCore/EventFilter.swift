import Foundation

/// Which events change the map (spec section 8, twin of toEngineEvents). Prior inputs and
/// camera sightings are never likelihoods, so no observation is used twice.
public enum EventFilter {
    public static func toEngineEvents(_ docs: [EventDoc], priorInputEventIds: [String]) -> [EngineEvent] {
        let skip = Set(priorInputEventIds)
        var byId: [String: EventDoc] = [:]
        for doc in docs.sorted(by: { $0.eventId < $1.eventId }) where byId[doc.eventId] == nil { byId[doc.eventId] = doc }

        // The same role rules as firestore.rules: an author may retract its own event and
        // command may retract any; only command or the family may confirm.
        let retracted = Set(byId.values.filter { r in
            guard r.type == .retraction, let target = r.targetEventId.flatMap({ byId[$0] }) else { return false }
            return r.role == .command || r.authorUid == target.authorUid
        }.compactMap(\.targetEventId))
        let confirmed = Set(byId.values.filter {
            $0.type == .confirmation && $0.decision == .confirmed && ($0.role == .command || $0.role == .family)
                && !retracted.contains($0.eventId)
        }.compactMap(\.targetEventId))

        var seen = Set<String>()
        var out: [EngineEvent] = []
        for doc in docs.sorted(by: { $0.eventId < $1.eventId }) {
            guard seen.insert(doc.eventId).inserted, !retracted.contains(doc.eventId), !skip.contains(doc.eventId) else { continue }
            switch (doc.type, doc.effect) {
            case let (.cleared, .cleared(_, pod, inputs)) where isConsistent(pod: pod, coverage: inputs.coverage):
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            case let (.clue, .clue(_, authenticity)) where authenticity != .low:
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            case let (.sighting, .clue(_, authenticity)) where authenticity != .low && confirmed.contains(doc.eventId):
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            default:
                continue
            }
        }
        return out
    }

    /// A stored clear is applied as stored, never re-derived, but it must agree with itself:
    /// coverage in 0 to 3 and pod equal to 1 - e^(-coverage).
    static func isConsistent(pod: Double, coverage: Double) -> Bool {
        guard pod.isFinite, coverage.isFinite, coverage >= 0, coverage <= 3 else { return false }
        return abs(pod - SearchMath.pod(coverage: coverage)) <= 1e-9
    }
}
