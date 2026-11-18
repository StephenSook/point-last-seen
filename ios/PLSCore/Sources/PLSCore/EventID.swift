import Crypto
import Foundation

/// Length-prefixed field encoding: each field is a 4-byte big-endian length followed by its
/// UTF-8 bytes. Fields are never joined with a separator, so ("ab","c") and ("a","bc") differ.
enum LengthPrefixed {
    static func encode(_ fields: [String]) -> Data {
        var data = Data()
        for field in fields {
            let bytes = Array(field.utf8)
            let n = UInt32(bytes.count)
            data.append(contentsOf: [UInt8(n >> 24 & 0xFF), UInt8(n >> 16 & 0xFF), UInt8(n >> 8 & 0xFF), UInt8(n & 0xFF)])
            data.append(contentsOf: bytes)
        }
        return data
    }

    static func sha256(_ fields: [String]) -> [UInt8] {
        Array(SHA256.hash(data: encode(fields)))
    }
}

func hex(_ bytes: some Sequence<UInt8>) -> String {
    bytes.map { String(format: "%02x", $0) }.joined()
}

/// Deterministic event ids (spec section 8): a re-send targets the same document.
public enum EventID {
    /// First 16 bytes, as 32 lowercase hex characters, of SHA-256 over incidentId, deviceId and decimal seq.
    public static func make(incidentId: String, deviceId: String, seq: Int) -> String {
        hex(LengthPrefixed.sha256([incidentId, deviceId, String(seq)]).prefix(16))
    }
}
