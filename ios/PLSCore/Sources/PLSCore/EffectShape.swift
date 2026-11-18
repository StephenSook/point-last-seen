import Foundation

/// The exact stored shape of an effect, matching the Firestore create rule and the shared
/// vectors. A stored event whose effect fails it is skipped and flagged, never applied.
public enum EffectShape {
    static let rdBases: Set<String> = ["hidden_target", "open_target", "default", "stated"]
    static let influences: Set<String> = Set(Influence.allCases.map(\.rawValue))
    static let authenticities: Set<String> = Set(Authenticity.allCases.map(\.rawValue))
    static let reasons: Set<String> = Set(NoneReason.allCases.map(\.rawValue))

    public static func isValid(_ effect: JSONValue) -> Bool {
        guard case let .object(o) = effect, case let .string(kind)? = o["kind"] else { return false }
        switch kind {
        case "cleared":
            guard Set(o.keys) == ["kind", "segmentId", "pod", "inputs"], case let .string(segmentId)? = o["segmentId"],
                  (1...16).contains(segmentId.unicodeScalars.count),
                  case let .number(pod)? = o["pod"], pod.isFinite, pod >= 0, pod <= 1,
                  case let .object(inputs)? = o["inputs"],
                  Set(inputs.keys) == ["coverage", "sweepWidthM", "trackLengthM", "areaM2", "rdBasis"],
                  case let .number(coverage)? = inputs["coverage"], coverage.isFinite, coverage >= 0,
                  nullOrNonNegative(inputs["sweepWidthM"]), nullOrNonNegative(inputs["trackLengthM"]),
                  case let .number(area)? = inputs["areaM2"], area.isFinite, area > 0,
                  case let .string(basis)? = inputs["rdBasis"], rdBases.contains(basis) else { return false }
            return true
        case "clue":
            guard Set(o.keys) == ["kind", "influences", "authenticity"], case let .object(map)? = o["influences"],
                  (1...64).contains(map.count),
                  map.values.allSatisfy({ if case let .string(v) = $0 { influences.contains(v) } else { false } }),
                  case let .string(a)? = o["authenticity"], authenticities.contains(a) else { return false }
            return true
        case "none":
            guard Set(o.keys) == ["kind", "why"], case let .string(why)? = o["why"] else { return false }
            return reasons.contains(why)
        default:
            return false
        }
    }

    static func nullOrNonNegative(_ v: JSONValue?) -> Bool {
        switch v {
        case .null?: return true
        case let .number(n)?: return n.isFinite && n >= 0
        default: return false
        }
    }
}
