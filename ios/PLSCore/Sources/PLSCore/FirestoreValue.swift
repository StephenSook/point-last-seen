import Foundation

extension JSONValue {
    /// The value as Foundation objects for a Firestore write: a whole number becomes an
    /// integer (the rules require `seq` to be an int), a fraction a double, null `NSNull`.
    public var firestoreValue: Any {
        switch self {
        case .null: return NSNull()
        case let .bool(b): return b
        case let .number(n):
            if n.isFinite, n.rounded() == n, abs(n) < 9_007_199_254_740_992 { return Int64(n) }
            return n
        case let .string(s): return s
        case let .array(a): return a.map(\.firestoreValue)
        case let .object(o): return o.mapValues(\.firestoreValue)
        }
    }
}

extension EventIdentity {
    /// Reads the writer's identity from a server copy of an event; nil when a field is missing.
    public init?(json: JSONValue) {
        guard case let .string(deviceId)? = json["deviceId"], case let .number(seqValue)? = json["seq"],
              let seq = Int(exactly: seqValue),                      // out of range or fractional: refuse, never trap
              case let .string(authorUid)? = json["authorUid"], case let .number(client)? = json["clientTimeMs"] else { return nil }
        self.init(deviceId: deviceId, seq: seq, authorUid: authorUid, clientTimeMs: client)
    }
}
