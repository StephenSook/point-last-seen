import FirebaseAuth
import Foundation
import PLSCore

/// Who this phone is for event ids: the device id is the Firebase Auth uid (the create rule
/// checks it), and the sequence starts at epoch milliseconds on a fresh install.
@MainActor
final class DeviceIdentity {
    private var allocator: SeqAllocator

    init(directory: URL = DeviceIdentity.storeDirectory()) throws {
        allocator = try SeqAllocator(fileURL: directory.appendingPathComponent("seq.json"),
                                     nowMs: Int(Date().timeIntervalSince1970 * 1000))
    }

    /// The anonymous uid; nil until sign-in has finished (sign in before leaving signal).
    var uid: String? { Auth.auth().currentUser?.uid }

    func nextSeq() throws -> Int { try allocator.next() }

    nonisolated static func storeDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("PLS", isDirectory: true)
    }
}
