import Foundation
import Testing

/// The field app is read at arm's length while walking: no text style below Title 3, and no
/// fixed point sizes (Dynamic Type only). Scans the app's and the widget's view sources.
@Suite struct FieldTextSizeTests {
    static let iosDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    static let tooSmall = ["largeTitle": false, "title": false, "title2": false, "title3": false, "headline": true,
                           "subheadline": true, "body": true, "callout": true, "footnote": true, "caption": true, "caption2": true]

    func swiftFiles(_ folder: String) -> [URL] {
        let root = Self.iosDir.appendingPathComponent(folder)
        guard let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        return e.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// The one named exception: the map's legal credit line ("© OpenStreetMap contributors"), which
    /// is credit text, never an instruction. It may use a fixed size of at least 13 points, only on
    /// lines that carry this marker, and only once in all the views.
    static let creditMarker = "// Map credit (legal text, never instructions): at least 13 pt."
    static let creditMinimumPoints = 13.0

    @Test func nothingBelowTitle3() throws {
        let files = swiftFiles("PLS/Views") + swiftFiles("PLSWidgets") + swiftFiles("PLSShared")
        #expect(files.count >= 10)                                       // the scan saw the views
        let style = try Regex(#"\.font\(\s*\.([A-Za-z0-9]+)"#)
        var problems: [String] = []
        for file in files {
            let text = try String(contentsOf: file, encoding: .utf8)
            for (n, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                for m in line.matches(of: style) {
                    let name = String(line[m.output[1].range!])
                    if name == "system", line.contains(Self.creditMarker), let size = Self.fixedSize(String(line)),
                       size >= Self.creditMinimumPoints { continue }
                    if name == "system" { problems.append("\(file.lastPathComponent):\(n + 1): fixed size") }
                    else if Self.tooSmall[name] == true { problems.append("\(file.lastPathComponent):\(n + 1): .\(name)") }
                }
            }
        }
        #expect(problems.isEmpty, "\(problems.joined(separator: "\n"))")
        // The exception stays a single, marked place.
        let marked = try files.reduce(0) { n, file in
            n + (try String(contentsOf: file, encoding: .utf8)).components(separatedBy: Self.creditMarker).count - 1
        }
        #expect(marked <= 1, "the credit exception is used \(marked) times")
    }

    /// The point size in `.font(.system(size: N ...))`; nil without one.
    static func fixedSize(_ line: String) -> Double? {
        guard let r = line.range(of: #"\.system\(\s*size:\s*([0-9.]+)"#, options: .regularExpression) else { return nil }
        let digits = line[r].split(separator: ":").last?.trimmingCharacters(in: .whitespaces)
        return digits.flatMap(Double.init)
    }

    @Test func theCreditExceptionNeedsItsMarkerAndThirteenPoints() {
        #expect(Self.fixedSize(".font(.system(size: 13, weight: .semibold)) " + Self.creditMarker) == 13)
        #expect(Self.fixedSize(".font(.system(size: 12.5))") == 12.5)
        #expect(Self.fixedSize(".font(.title3)") == nil)
    }
}
