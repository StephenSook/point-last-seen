import Foundation

/// Event sequence numbers for this device. A fresh install starts at the current epoch
/// milliseconds and counts up by one, so a reinstall (which keeps the anonymous uid in the
/// Keychain but loses this file) can never reuse an event id. Disk first: a number is handed
/// out only after it is written.
public struct SeqAllocator: Sendable {
    public let fileURL: URL
    private var last: Int?
    private let startMs: Int

    struct Stored: Codable { let last: Int }

    public init(fileURL: URL, nowMs: Int) throws {
        self.fileURL = fileURL
        self.startMs = nowMs
        if FileManager.default.fileExists(atPath: fileURL.path) {
            last = try JSONDecoder().decode(Stored.self, from: Data(contentsOf: fileURL)).last
        }
    }

    public mutating func next() throws -> Int {
        let n = last.map { $0 + 1 } ?? startMs
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(Stored(last: n)).write(to: fileURL, options: .atomic)
        last = n
        return n
    }
}
