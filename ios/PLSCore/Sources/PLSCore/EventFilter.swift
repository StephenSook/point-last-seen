import Foundation

/// Which events change the map (spec section 8, twin of toEngineEvents). Prior inputs and
/// camera sightings are never likelihoods, so no observation is used twice.
/// Stored events read back from the pack or the listener: the ones that decoded, and the ids
/// of the ones that did not.
public struct DecodedEvents: Sendable, Equatable {
    public var docs: [EventDoc]
    public var malformedIds: [String]
}

public enum EventFilter {
    /// Decodes stored events one by one. A malformed event (an effect that fails the exact
    /// stored shape, or any field that does not decode) is skipped and its id flagged for
    /// command; it never stops the others or throws.
    public static func decode(_ stored: [JSONValue]) -> DecodedEvents {
        var docs: [EventDoc] = []
        var malformed: [String] = []
        for value in stored {
            if let effect = value["effect"], EffectShape.isValid(effect), let doc = try? value.decode(EventDoc.self) {
                docs.append(doc)
            } else if case let .string(id)? = value["eventId"] {
                malformed.append(id)
            } else {
                malformed.append("(no id)")
            }
        }
        return DecodedEvents(docs: docs, malformedIds: malformed)
    }

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

        // One confirmation per target decides: command outranks the family (a writer sets its
        // own clientTimeMs, so time alone must not let a family device override command), then
        // the latest by (clientTimeMs, eventId) within that role.
        func rank(_ k: EventDoc) -> (Int, Double, String) { (k.role == .command ? 1 : 0, k.clientTimeMs, k.eventId) }
        var latest: [String: EventDoc] = [:]
        for k in unique where k.type == .confirmation && (k.role == .command || k.role == .family) && !retracted.contains(k.eventId) {
            guard let target = k.targetEventId, k.decision != nil else { continue }
            if let prev = latest[target], rank(prev) > rank(k) { continue }
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
