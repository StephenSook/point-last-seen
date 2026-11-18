import Foundation
@testable import PLSCore

struct VectorMismatch: Error, CustomStringConvertible {
    let path: String
    let detail: String
    var description: String { "\(path): \(detail)" }
}

/// The one comparer (plan Global Constraints): number leaves within 1e-12 relative;
/// strings, booleans, null, array order and object key sets exact.
func expectVector(_ actual: JSONValue, _ expected: JSONValue, path: String = "$") throws {
    switch (actual, expected) {
    case (.null, .null):
        return
    case let (.bool(a), .bool(b)):
        if a != b { throw VectorMismatch(path: path, detail: "bool \(a) != \(b)") }
    case let (.string(a), .string(b)):
        if a != b { throw VectorMismatch(path: path, detail: "string \"\(a)\" != \"\(b)\"") }
    case let (.number(a), .number(b)):
        if !near(a, b) { throw VectorMismatch(path: path, detail: "number \(a) != \(b)") }
    case let (.array(a), .array(b)):
        if a.count != b.count { throw VectorMismatch(path: path, detail: "array length \(a.count) != \(b.count)") }
        for (i, (x, y)) in zip(a, b).enumerated() { try expectVector(x, y, path: "\(path)[\(i)]") }
    case let (.object(a), .object(b)):
        if Set(a.keys) != Set(b.keys) {
            throw VectorMismatch(path: path, detail: "keys \(a.keys.sorted()) != \(b.keys.sorted())")
        }
        for key in a.keys.sorted() { try expectVector(a[key]!, b[key]!, path: "\(path).\(key)") }
    default:
        throw VectorMismatch(path: path, detail: "type \(actual) != \(expected)")
    }
}
