import Foundation

/// Which events change the map (spec section 8, twin of toEngineEvents). Prior inputs and
/// camera sightings are never likelihoods, so no observation is used twice.
public enum EventFilter {
    public static func toEngineEvents(_ docs: [EventDoc], priorInputEventIds: [String]) -> [EngineEvent] {
        let skip = Set(priorInputEventIds)
        let retracted = Set(docs.filter { $0.type == .retraction }.compactMap(\.targetEventId))
        let confirmed = Set(docs.filter { $0.type == .confirmation && $0.decision == .confirmed && !retracted.contains($0.eventId) }
            .compactMap(\.targetEventId))

        var seen = Set<String>()
        var out: [EngineEvent] = []
        for doc in docs.sorted(by: { $0.eventId < $1.eventId }) {
            guard seen.insert(doc.eventId).inserted, !retracted.contains(doc.eventId), !skip.contains(doc.eventId) else { continue }
            switch (doc.type, doc.effect) {
            case (.cleared, .cleared):
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
}
