import Foundation

/// Which events change the map (spec section 8, twin of toEngineEvents). Prior inputs and
/// camera sightings are never likelihoods, so no observation is used twice.
public enum EventFilter {
    public static func toEngineEvents(_ docs: [EventDoc], priorInputEventIds: [String]) -> [EngineEvent] {
        // First copy of an id wins, in input order.
        var byId: [String: EventDoc] = [:]
        for doc in docs where byId[doc.eventId] == nil { byId[doc.eventId] = doc }
        let unique = byId.values.sorted { $0.eventId < $1.eventId }

        // The same role rules as firestore.rules: an author may retract its own event and
        // command may retract any; only command or the family may confirm.
        let retracted = Set(unique.filter { r in
            guard r.type == .retraction, let targetId = r.targetEventId else { return false }
            return r.role == .command || byId[targetId]?.authorUid == r.authorUid
        }.compactMap(\.targetEventId))

        // The latest counting confirmation per target, by (clientTimeMs, eventId), decides.
        var latest: [String: EventDoc] = [:]
        for k in unique where k.type == .confirmation && (k.role == .command || k.role == .family) && !retracted.contains(k.eventId) {
            guard let target = k.targetEventId, k.decision != nil else { continue }
            if let prev = latest[target], (prev.clientTimeMs, prev.eventId) > (k.clientTimeMs, k.eventId) { continue }
            latest[target] = k
        }

        let skip = Set(priorInputEventIds)
        var out: [EngineEvent] = []
        for doc in unique where !retracted.contains(doc.eventId) && !skip.contains(doc.eventId) {
            switch (doc.type, doc.effect) {
            case let (.cleared, .cleared(_, pod, inputs)) where isConsistent(pod: pod, coverage: inputs.coverage):
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            case let (.clue, .clue(_, authenticity)) where authenticity != .low:
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            case let (.sighting, .clue(_, authenticity)) where authenticity != .low && latest[doc.eventId]?.decision == .confirmed:
                out.append(EngineEvent(eventId: doc.eventId, effect: doc.effect))
            default:
                continue
            }
        }
        return out
    }

    /// A stored clear is applied as stored, never re-derived, but it must agree with itself:
    /// a finite, non-negative coverage (computed coverage may exceed 3) and pod = 1 - e^(-coverage).
    static func isConsistent(pod: Double, coverage: Double) -> Bool {
        guard pod.isFinite, coverage.isFinite, coverage >= 0 else { return false }
        return abs(pod - SearchMath.pod(coverage: coverage)) <= 1e-9
    }
}
