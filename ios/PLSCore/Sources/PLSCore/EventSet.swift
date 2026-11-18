import Foundation

/// Event-set identity shared by every seat (coordinator decision during the build).
public enum EventSet {
    static let crockford = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    /// SHA-256 over the decimal prior version followed by the unique ids in ascending order,
    /// each field length-prefixed; 64 lowercase hex characters. An empty set hashes the
    /// prior version alone.
    public static func hash(priorVersion: Int, eventIds: [String]) -> String {
        let ids = Array(Set(eventIds)).sorted()
        return hex(LengthPrefixed.sha256([String(priorVersion)] + ids))
    }

    /// The first 20 bits of the hash as 4 Crockford base32 characters, most significant first.
    public static func convergenceCode(_ hash: String) -> String {
        let prefix = String(hash.prefix(5))
        guard prefix.count == 5, let value = UInt32(prefix, radix: 16) else { return "????" }
        return String((0..<4).map { k in crockford[Int((value >> UInt32(15 - 5 * k)) & 31)] })
    }
}
