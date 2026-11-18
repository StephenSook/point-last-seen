import FirebaseFirestore
import Foundation
import PLSCore

/// Turns a Firestore document's values into `JSONValue`, so the shared filter can read stored
/// events. Booleans stay booleans (Firestore hands both as NSNumber); a Timestamp becomes epoch
/// milliseconds, the unit the engine uses.
enum FirestoreJSON {
    static func value(_ any: Any) -> JSONValue {
        switch any {
        case let n as NSNumber:
            return CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        case let s as String:
            return .string(s)
        case let t as Timestamp:
            return .number(Double(t.seconds) * 1000 + Double(t.nanoseconds / 1_000_000))
        case let a as [Any]:
            return .array(a.map(value))
        case let o as [String: Any]:
            return .object(o.mapValues(value))
        default:
            return .null
        }
    }
}
