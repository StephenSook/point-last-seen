import Foundation

/// Compares dotted version numbers ("0.10.2") part by part as numbers; a missing part counts as
/// 0. Command raises `minimum_version_ios` to ask old builds to update; a value that is not a
/// dotted number never asks for an update, so a typo cannot lock a searcher out.
public enum AppVersion {
    public static func isBelow(_ current: String, minimum: String) -> Bool {
        guard let have = parts(current), let need = parts(minimum) else { return false }
        for i in 0..<max(have.count, need.count) {
            let a = i < have.count ? have[i] : 0, b = i < need.count ? need[i] : 0
            if a != b { return a < b }
        }
        return false
    }

    static func parts(_ text: String) -> [Int]? {
        let pieces = text.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false)
        let numbers = pieces.map { $0.allSatisfy(\.isASCII) && !$0.isEmpty ? Int($0) : nil }
        guard !numbers.isEmpty, numbers.allSatisfy({ $0 != nil && $0! >= 0 }) else { return nil }
        return numbers.map { $0! }
    }
}
